use core::str::FromStr;
use std::collections::VecDeque;

use anyhow::{Context, bail};
use solidity_slot::{H256, MappingKey, Slot, U256};
use syn_solidity::Type;
use typed_arena::Arena;

fn parse_layout(layout: &str) -> anyhow::Result<Type> {
    match syn::parse_str::<Type>(layout).context("failed to parse layout as Solidity type")? {
        ty @ (Type::Mapping(_) | Type::Array(_)) => Ok(ty),
        other => bail!("unsupported top-level layout type: {other:?}"),
    }
}

fn parse_mapping_key<'a>(key_type: &Type, key: &'a str) -> anyhow::Result<MappingKey<'a>> {
    match key_type {
        Type::Uint(_, size) => {
            let bits = size.map_or(256, |s| s.get());
            match bits {
                256 => Ok(MappingKey::Uint256(
                    U256::from_str(key).context("invalid uint256 key")?,
                )),
                64 => Ok(MappingKey::Uint64(
                    key.parse::<u64>().context("invalid uint64 key")?,
                )),
                other => bail!("unsupported uint size for mapping key: uint{other}"),
            }
        }
        Type::FixedBytes(_, size) => match size.get() {
            32 => Ok(MappingKey::Bytes32(
                H256::from_str(key).context("invalid bytes32 key")?,
            )),
            other => bail!("unsupported fixed-bytes size for mapping key: bytes{other}"),
        },
        Type::String(_) => Ok(MappingKey::String(key)),
        other => bail!("unsupported mapping key type: {other:?}"),
    }
}

#[derive(Debug, clap::Args)]
pub struct Cmd {
    /// The Solidity storage layout type, e.g.
    /// "mapping(uint256 => mapping(uint256 => uint256)[])"
    pub layout: String,
    /// Keys from outermost to innermost, e.g. 100 1 123
    pub keys: Vec<String>,
}

// Consumes one key per container, outermost first. Each Slot node lives in the arena so the borrowed tree stays valid.
fn build_slot<'a>(
    ty: &Type,
    keys: &mut VecDeque<&'a str>,
    arena: &'a Arena<Slot<'a>>,
) -> anyhow::Result<&'a Slot<'a>> {
    match ty {
        Type::Mapping(mapping) => {
            let key = keys
                .pop_front()
                .context("not enough keys: missing a mapping key")?;
            let mapping_key = parse_mapping_key(&mapping.key, key)?;
            let base = build_slot(&mapping.value, keys, arena)?;
            Ok(arena.alloc(Slot::Mapping(base, mapping_key)))
        }
        Type::Array(arr) => {
            let key = keys
                .pop_front()
                .context("not enough keys: missing an array index")?;
            let index = U256::from_str(key).context("invalid array index")?;
            let base = build_slot(&arr.ty, keys, arena)?;
            Ok(arena.alloc(Slot::Array(base, index)))
        }
        _ => Ok(arena.alloc(Slot::Offset(U256::from(0u32)))),
    }
}

fn calculate_slot(layout: &str, keys: &[String]) -> anyhow::Result<U256> {
    let ty = parse_layout(layout)?;
    let mut queue: VecDeque<&str> = keys.iter().map(String::as_str).collect();
    let arena = Arena::new();
    let slot = build_slot(&ty, &mut queue, &arena)?;
    if !queue.is_empty() {
        bail!(
            "too many keys: {} leftover after walking the layout",
            queue.len()
        );
    }
    Ok(slot.slot())
}

impl Cmd {
    pub fn run(&self) -> anyhow::Result<()> {
        let slot = calculate_slot(&self.layout, &self.keys)?;
        println!("{}", <H256>::new(slot.to_be_bytes()));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nested_mapping_layout() {
        let ty = parse_layout("mapping(uint256 => mapping(uint256 => uint256)[])")
            .expect("should parse");
        assert!(matches!(ty, syn_solidity::Type::Mapping(_)));
    }

    #[test]
    fn rejects_garbage_layout() {
        assert!(parse_layout("not a type !!").is_err());
    }

    #[test]
    fn parses_uint256_key() {
        let ty = key_type("uint256");
        let k = parse_mapping_key(&ty, "123").unwrap();
        assert!(matches!(k, MappingKey::Uint256(_)));
    }

    #[test]
    fn parses_uint64_key() {
        let ty = key_type("uint64");
        assert!(matches!(
            parse_mapping_key(&ty, "7").unwrap(),
            MappingKey::Uint64(_)
        ));
    }

    #[test]
    fn parses_bytes32_key() {
        let ty = key_type("bytes32");
        let k = parse_mapping_key(
            &ty,
            "0x0000000000000000000000000000000000000000000000000000000000000001",
        )
        .unwrap();
        assert!(matches!(k, MappingKey::Bytes32(_)));
    }

    #[test]
    fn parses_string_key() {
        let ty = key_type("string");
        assert!(matches!(
            parse_mapping_key(&ty, "hello").unwrap(),
            MappingKey::String(_)
        ));
    }

    #[test]
    fn rejects_bad_uint_key() {
        let ty = key_type("uint256");
        assert!(parse_mapping_key(&ty, "not-a-number").is_err());
    }

    #[test]
    fn rejects_unsupported_key_type() {
        let ty = key_type("uint128");
        assert!(parse_mapping_key(&ty, "1").is_err());
    }

    // Extract the key Type from a `mapping(KEY => uint256)` layout string.
    fn key_type(key: &str) -> Type {
        match parse_layout(&format!("mapping({key} => uint256)")).unwrap() {
            Type::Mapping(m) => *m.key,
            _ => unreachable!("constructed a mapping"),
        }
    }

    #[test]
    fn known_answer_vector() {
        let keys = ["100".to_owned(), "1".to_owned(), "123".to_owned()];
        let slot =
            calculate_slot("mapping(uint256 => mapping(uint256 => uint256)[])", &keys).unwrap();
        assert_eq!(
            <H256>::new(slot.to_be_bytes()),
            <H256>::new(hex_literal::hex!(
                "00a9b48fe93e5d10ebc2d9021d1477088c6292bf047876944343f57fdf3f0467"
            ))
        );
    }

    #[test]
    fn too_few_keys_is_error() {
        let keys = ["100".to_owned()];
        assert!(
            calculate_slot("mapping(uint256 => mapping(uint256 => uint256)[])", &keys,).is_err()
        );
    }

    #[test]
    fn too_many_keys_is_error() {
        let keys = [
            "100".to_owned(),
            "1".to_owned(),
            "123".to_owned(),
            "9".to_owned(),
        ];
        assert!(
            calculate_slot("mapping(uint256 => mapping(uint256 => uint256)[])", &keys,).is_err()
        );
    }

    #[test]
    fn single_mapping_uint256() {
        let keys = ["1".to_owned()];
        let a = calculate_slot("mapping(uint256 => uint256)", &keys).unwrap();
        let b = calculate_slot("mapping(uint256 => uint256)", &keys).unwrap();
        assert_eq!(a, b);
        assert_ne!(a, U256::from(0u32));
    }

    #[test]
    fn single_dynamic_array() {
        let keys = ["2".to_owned()];
        let slot = calculate_slot("uint256[]", &keys).unwrap();
        let expected =
            U256::from_be_bytes(*solidity_slot::keccak256(U256::from(0u32).to_be_bytes()).get())
                + U256::from(2u32);
        assert_eq!(slot, expected);
    }

    #[test]
    fn bytes32_mapping_key() {
        let keys =
            ["0x0000000000000000000000000000000000000000000000000000000000000001".to_owned()];
        let slot = calculate_slot("mapping(bytes32 => uint256)", &keys).unwrap();
        assert_ne!(slot, U256::from(0u32));
    }
}
