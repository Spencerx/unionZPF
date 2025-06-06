import { safeWallet } from "$lib/transfer/shared/services/handlers/safe.ts"
import { Effect, Schedule } from "effect"

// XXX: shouldn't be scheduled forever and shouldn't coerce to untagged error or die
export const resolveSafeTx = (
  safeTxHash: `0x${string}`,
): Effect.Effect<`0x${string}`, never, never> => {
  return Effect.tryPromise({
    try: () => safeWallet.txs.getBySafeTxHash(safeTxHash),
    catch: e => new Error(`Failed to resolve Safe tx: ${String(e)}`),
  }).pipe(
    Effect.flatMap((details) =>
      details.txHash
        ? Effect.succeed(details.txHash as `0x${string}`)
        : Effect.fail(new Error("txHash not yet available"))
    ),
    Effect.retry(Schedule.addDelay(Schedule.forever, () => "500 millis")),
    Effect.catchAll(() => Effect.die("Unexpected unreachable failure")),
  )
}
