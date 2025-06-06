use super::{Ssz, BYTES_PER_LENGTH_OFFSET, MAX_LENGTH_VALUE};

/// Allow for encoding an ordered series of distinct or indistinct objects as SSZ bytes.
///
/// **You must call `finalize(..)` after the final `append(..)` call** to ensure the bytes are
/// written to `buf`.
pub struct SszEncoder<'a> {
    offset: usize,
    buf: &'a mut Vec<u8>,
    variable_bytes: Vec<u8>,
}

impl<'a> SszEncoder<'a> {
    /// Instantiate a new encoder for encoding a SSZ container.
    pub fn container(buf: &'a mut Vec<u8>, num_fixed_bytes: usize) -> Self {
        buf.reserve(num_fixed_bytes);

        Self {
            offset: num_fixed_bytes,
            buf,
            variable_bytes: vec![],
        }
    }

    /// Append some `item` to the SSZ bytes.
    pub fn append<T: Ssz>(&mut self, item: &T) {
        self.append_parameterized(T::SSZ_FIXED_LEN.is_some(), |buf| item.ssz_append(buf));
    }

    /// Uses `ssz_append` to append the encoding of some item to the SSZ bytes.
    pub fn append_parameterized<F>(&mut self, is_ssz_fixed_len: bool, ssz_append: F)
    where
        F: Fn(&mut Vec<u8>),
    {
        if is_ssz_fixed_len {
            ssz_append(self.buf);
        } else {
            self.buf
                .extend_from_slice(&encode_length(self.offset + self.variable_bytes.len()));

            ssz_append(&mut self.variable_bytes);
        }
    }

    /// Write the variable bytes to `self.bytes`.
    ///
    /// This method must be called after the final `append(..)` call when serializing
    /// variable-length items.
    pub fn finalize(&mut self) -> &mut Vec<u8> {
        self.buf.append(&mut self.variable_bytes);

        self.buf
    }
}

/// Encode `len` as a little-endian byte array of `BYTES_PER_LENGTH_OFFSET` length.
///
/// If `len` is larger than `2 ^ BYTES_PER_LENGTH_OFFSET`, a `debug_assert` is raised.
#[must_use]
pub fn encode_length(len: usize) -> [u8; BYTES_PER_LENGTH_OFFSET] {
    // Note: it is possible for `len` to be larger than what can be encoded in
    // `BYTES_PER_LENGTH_OFFSET` bytes, triggering this debug assertion.
    //
    // These are the alternatives to using a `debug_assert` here:
    //
    // 1. Use `assert`.
    // 2. Push an error to the caller (e.g., `Option` or `Result`).
    // 3. Ignore it completely.
    //
    // I have avoided (1) because it's basically a choice between "produce invalid SSZ" or "kill
    // the entire program". I figure it may be possible for an attacker to trigger this assert and
    // take the program down -- I think producing invalid SSZ is a better option than this.
    //
    // I have avoided (2) because this error will need to be propagated upstream, making encoding a
    // function which may fail. I don't think this is ergonomic and the upsides don't outweigh the
    // downsides.
    //
    // I figure a `debug_assertion` is better than (3) as it will give us a chance to detect the
    // error during testing.
    //
    // If you have a different opinion, feel free to start an issue and tag @paulhauner.
    debug_assert!(len <= MAX_LENGTH_VALUE);

    let mut bytes = [0; BYTES_PER_LENGTH_OFFSET];
    bytes.copy_from_slice(&len.to_le_bytes()[0..BYTES_PER_LENGTH_OFFSET]);
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_length() {
        assert_eq!(encode_length(0), [0; 4]);

        assert_eq!(encode_length(1), [1, 0, 0, 0]);

        assert_eq!(
            encode_length(MAX_LENGTH_VALUE),
            [255; BYTES_PER_LENGTH_OFFSET]
        );
    }

    #[test]
    #[should_panic]
    #[cfg(debug_assertions)]
    fn test_encode_length_above_max_debug_panics() {
        let _ = encode_length(MAX_LENGTH_VALUE + 1);
    }

    #[test]
    #[cfg(not(debug_assertions))]
    fn test_encode_length_above_max_not_debug_does_not_panic() {
        assert_eq!(&encode_length(MAX_LENGTH_VALUE + 1)[..], &[0; 4]);
    }
}
