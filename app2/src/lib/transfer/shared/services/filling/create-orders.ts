import { OrderCreationError } from "$lib/transfer/shared/errors"
import type { TransferContext } from "$lib/transfer/shared/services/filling/create-context.ts"
import {
  CosmosChannelDestination,
  CosmWasmClientDestination,
  CosmWasmClientSource,
  createCosmWasmClient,
} from "@unionlabs/sdk/cosmos"
import {
  createViemPublicClient,
  EvmChannelDestination,
  ViemPublicClientDestination,
  ViemPublicClientSource,
} from "@unionlabs/sdk/evm"
import { FungibleIntent } from "@unionlabs/sdk/schema"
import {
  createCosmosToCosmosFungibleAssetOrder,
  createCosmosToEvmFungibleAssetOrder,
  createEvmToCosmosFungibleAssetOrder,
  createEvmToEvmFungibleAssetOrder,
} from "@unionlabs/sdk/ucs03"
import { Batch, type Instruction } from "@unionlabs/sdk/ucs03/instruction"
import { Array as Arr, Effect, Match, Option, pipe, Predicate as P, Schema } from "effect"
import { fromHex, http } from "viem"

export function createOrdersBatch(
  context: TransferContext,
): Effect.Effect<Option.Option<Instruction>, OrderCreationError> {
  return Effect.gen(function*() {
    if (context.intents.length === 0) {
      return Option.none<Instruction>()
    }

    const grouped = Arr.groupBy(
      context.intents,
      intent =>
        `${intent.sourceChainId}-${intent.destinationChain.universal_chain_id}-${intent.channel.destination_channel_id}-${intent.ucs03address}`,
    )

    // We only support one group per batch
    const firstGroup = Object.values(grouped)[0]
    const [first] = firstGroup

    const decodeIntent = Schema.decode(FungibleIntent.AssetOrderIntentFromTransferIntent, {
      errors: "all",
      onExcessProperty: "ignore",
    })

    const newIntents = firstGroup.map(intent =>
      decodeIntent({
        sender: intent.sender,
        receiver: intent.receiver,
        baseToken: intent.baseToken,
        baseAmount: intent.baseAmount,
        quoteAmount: intent.quoteAmount,
        sourceChainId: intent.sourceChainId,
        sourceChannelId: intent.sourceChannelId,
        sourceChain: intent.sourceChain,
        destinationChain: intent.destinationChain,
      })
    )

    console.log("newIntents", newIntents)

    const resolvedIntents = yield* Effect.all(newIntents, { concurrency: "unbounded" })

    console.log("resolvedIntents", resolvedIntents)
    // XXX: discriminate order intent data at higher level
    const provideClients = yield* Match.value([
      first.sourceChain.rpc_type,
      first.destinationChain.rpc_type,
    ]).pipe(
      Match.whenAnd(
        ["evm", "cosmos"],
        () =>
          // @ts-expect-error 2345
          Effect.all(resolvedIntents.map(createEvmToCosmosFungibleAssetOrder)).pipe(
            Effect.provideServiceEffect(
              ViemPublicClientSource,
              pipe(
                first.sourceChain.toViemChain(),
                Option.map(chain => createViemPublicClient({ chain, transport: http() })),
                Effect.flatten,
                Effect.map(client => ({ client })),
              ),
            ),
            Effect.provideServiceEffect(
              CosmWasmClientDestination,
              pipe(
                first.destinationChain.getRpcUrl("rpc"),
                Option.map(createCosmWasmClient),
                Effect.flatten,
                Effect.map(client => ({ client })),
              ),
            ),
            Effect.provideServiceEffect(
              CosmosChannelDestination,
              Effect.succeed({
                ucs03address: fromHex(first.channel.destination_port_id, "string"),
                channelId: first.channel.destination_channel_id,
              }),
            ),
          ),
      ),
      Match.when(
        ["evm", "evm"],
        () =>
          // @ts-expect-error 2345
          Effect.all(resolvedIntents.map(createEvmToEvmFungibleAssetOrder)).pipe(
            Effect.provideServiceEffect(
              ViemPublicClientSource,
              pipe(
                first.sourceChain.toViemChain(),
                Option.map(chain => createViemPublicClient({ chain, transport: http() })),
                Effect.flatten,
                Effect.map(client => ({ client })),
              ),
            ),
            Effect.provideServiceEffect(
              ViemPublicClientDestination,
              pipe(
                first.destinationChain.toViemChain(),
                Option.map(chain => createViemPublicClient({ chain, transport: http() })),
                Effect.flatten,
                Effect.map(client => ({ client })),
              ),
            ),
            Effect.provideServiceEffect(
              EvmChannelDestination,
              Effect.succeed({
                ucs03address: first.channel.destination_port_id,
                channelId: first.channel.destination_channel_id,
              }),
            ),
          ),
      ),
      Match.when(
        ["cosmos", "evm"],
        () =>
          // @ts-expect-error 2345
          Effect.all(resolvedIntents.map(createCosmosToEvmFungibleAssetOrder)).pipe(
            Effect.provideServiceEffect(
              CosmWasmClientSource,
              pipe(
                first.sourceChain.getRpcUrl("rpc"),
                Option.map(createCosmWasmClient),
                Effect.flatten,
                Effect.map(client => ({ client })),
              ),
            ),
            Effect.provideServiceEffect(
              ViemPublicClientDestination,
              pipe(
                first.destinationChain.toViemChain(),
                Option.map(chain => createViemPublicClient({ chain, transport: http() })),
                Effect.flatten,
                Effect.map(client => ({ client })),
              ),
            ),
            Effect.provideServiceEffect(
              EvmChannelDestination,
              Effect.succeed({
                ucs03address: first.channel.destination_port_id,
                channelId: first.channel.destination_channel_id,
              }),
            ),
          ),
      ),
      Match.when(
        ["cosmos", "cosmos"],
        () =>
          // @ts-expect-error 2345
          Effect.all(resolvedIntents.map(createCosmosToCosmosFungibleAssetOrder)).pipe(
            Effect.provideServiceEffect(
              CosmWasmClientSource,
              pipe(
                first.sourceChain.getRpcUrl("rpc"),
                Option.map(createCosmWasmClient),
                Effect.flatten,
                Effect.map(client => ({ client })),
              ),
            ),
            Effect.provideServiceEffect(
              CosmWasmClientDestination,
              pipe(
                first.destinationChain.getRpcUrl("rpc"),
                Option.map(createCosmWasmClient),
                Effect.flatten,
                Effect.map(client => ({ client })),
              ),
            ),
            Effect.provideServiceEffect(
              CosmosChannelDestination,
              Effect.succeed({
                ucs03address: fromHex(first.channel.destination_port_id, "string"),
                channelId: first.channel.destination_channel_id,
              }),
            ),
          ),
      ),
      Match.orElse(() =>
        Effect.fail(
          new OrderCreationError({
            details: {
              reason:
                `Unsupported combo: ${first.sourceChain.rpc_type} -> ${first.destinationChain.rpc_type}`,
            },
          }),
        )
      ),
    ).pipe(
      Effect.annotateLogs({
        source: first.sourceChain.rpc_type,
        destination: first.destinationChain.rpc_type,
      }),
      Effect.tapErrorCause((cause) => Effect.logError("order.create", cause)),
    )

    return pipe(
      provideClients,
      Arr.filter(P.isNotNull),
      Option.liftPredicate(Arr.isNonEmptyArray),
      Option.map((operand) => new Batch({ operand })),
    )
  }).pipe(
    Effect.catchAll(error =>
      Effect.fail(
        new OrderCreationError({
          details: { error, intents: context.intents.length },
        }),
      )
    ),
  )
}
