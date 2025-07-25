<script lang="ts">
import { beforeNavigate } from "$app/navigation"
import Card from "$lib/components/ui/Card.svelte"
import StepProgressBar from "$lib/components/ui/StepProgressBar.svelte"
import { runFork } from "$lib/runtime"
import { type FeeIntent, FeeStore } from "$lib/stores/fee.svelte"
import { transferHashStore } from "$lib/stores/transfer-hash.svelte.ts"
import { wallets } from "$lib/stores/wallets.svelte.ts"
import transfer from "$lib/transfer/index.svelte"
import {
  CreateContextState,
  createContextState,
  type StateResult,
} from "$lib/transfer/multisig/services/filling"
import { FillingStep, MessageStep, Steps } from "$lib/transfer/multisig/steps"
import { transferData } from "$lib/transfer/shared/data/transfer-data.svelte.ts"
import type { ContextFlowError } from "$lib/transfer/shared/errors"
import type { TransferContext } from "$lib/transfer/shared/services/filling/create-context.ts"
import { BABYLON_METADATA } from "@unionlabs/sdk/constants/gas-denoms"
import { TokenRawAmount } from "@unionlabs/sdk/schema"
import { Array as Arr, Effect, Either as E, Fiber, FiberId, Option } from "effect"
import { constVoid, pipe } from "effect/Function"
import { fly } from "svelte/transition"
let currentPage = $state(0)
let previousPage = $state(0)
let isLoading = $state(true)
let steps = $state<Option.Option<Array<Steps.Steps>>>(Option.none())
let errors = $state<Option.Option<ContextFlowError>>(Option.none())
let currentFiber: Option.Option<Fiber.RuntimeFiber<void, never>> = Option.none()
let statusMessage = $state("")

let direction = $derived(currentPage > previousPage ? 1 : -1)

const currentStep = $derived(
  pipe(
    steps, // [currentPage]
    Option.flatMap(Arr.get(currentPage)),
    Option.getOrElse(() => Steps.Filling()),
  ),
)

function goToNextPage() {
  if (Option.isSome(steps) && currentPage < steps.value.length - 1) {
    previousPage = currentPage
    currentPage++
  }
}

function goToPreviousPage() {
  if (currentPage > 0) {
    previousPage = currentPage
    currentPage--
  }
}

function handleActionButtonClick() {
  if (Option.isNone(steps)) {
    return
  }
  const currentStep = steps.value[currentPage]

  if (Steps.is("Filling")(currentStep)) {
    goToNextPage()
    return
  }

  if (Steps.is("CheckMessage")(currentStep)) {
    goToNextPage()
  }
}

$effect(() => {
  if (currentPage !== 0) {
    return
  }
  interruptFiber()

  isLoading = true
  steps = Option.none()
  errors = Option.none()

  // TODO: replace with real fee
  const emptyFeeIntent: FeeIntent = {
    decimals: 0,
    baseToken: BABYLON_METADATA.address,
    quoteAmount: TokenRawAmount.make(0n),
    baseAmount: TokenRawAmount.make(0n),
  }

  const machineEffect = Effect.gen(function*() {
    let currentState: CreateContextState = CreateContextState.Filling()
    let context: TransferContext | null = null

    while (true) {
      const result: StateResult | void = yield* createContextState(
        currentState,
        transferData,
        Option.some(E.right(emptyFeeIntent)),
      )

      if (!result) {
        break
      }

      statusMessage = result.message

      if (Option.isSome(result.error)) {
        errors = result.error
        steps = Option.none()
        isLoading = false
        currentFiber = Option.none()
        return
      }

      if (Option.isSome(result.nextState)) {
        currentState = result.nextState.value
        continue
      }

      if (Option.isSome(result.context)) {
        context = result.context.value
      }

      break
    }

    if (context) {
      steps = Option.some([
        Steps.Filling(),
        Steps.CheckMessage({
          context,
        }),
      ])
    }
    isLoading = false
    currentFiber = Option.none()
  })

  const fiber = runFork(machineEffect as Effect.Effect<void, never, never>)
  currentFiber = Option.some(fiber)

  return () => fiber?.unsafeInterruptAsFork(FiberId.none)
})

function interruptFiber() {
  Option.match(currentFiber, {
    onNone: constVoid,
    onSome: fiber => Fiber.interruptFork(fiber),
  })
  currentFiber = Option.none()
}

function newTransfer() {
  interruptFiber()
  steps = Option.some([Steps.Filling()])
  errors = Option.none()
  isLoading = true
  currentPage = 0
  transferData.raw.reset()
  transferData.raw.sender = ""
  transferData.raw.updateField("sender", "")
  wallets.clearInputAddress()
}

beforeNavigate(newTransfer)
</script>

<Card
  divided
  class="max-w-sm w-full md:mt-24 relative self-center flex flex-col justify-between min-h-[450px] overflow-hidden transition-transform duration-500"
>
  <div class="w-full">
    <StepProgressBar
      class="w-full"
      currentStep={currentPage + 1}
      totalSteps={steps.pipe(
        Option.map(ts => ts.length),
        Option.getOrElse(() => 1),
      )}
      stepDescriptions={steps.pipe(
        Option.map(ts => ts.map(Steps.description)),
        Option.getOrElse(() => ["Configure your transfer"]),
      )}
    />
  </div>

  <div class="grid w-full grow overflow-hidden">
    {#if currentPage === 0}
      <div
        class="flex grow col-start-1 col-end-2 row-start-1 row-end-2"
        out:fly={{ x: direction * -382, duration: 300 }}
        in:fly={{ x: direction * 382, duration: 300 }}
      >
        <FillingStep
          onContinue={handleActionButtonClick}
          {statusMessage}
          {errors}
          onErrorClose={() => {
          }}
          loading={isLoading}
        />
      </div>
    {/if}
    {#if Steps.is("CheckMessage")(currentStep)}
      <div
        class="flex grow col-start-1 col-end-2 row-start-1 row-end-2"
        out:fly={{ x: direction * -382, duration: 300 }}
        in:fly={{ x: direction * 382, duration: 300 }}
      >
        <MessageStep
          stepIndex={currentPage + 1}
          step={currentStep}
          onBack={goToPreviousPage}
          onSubmit={goToNextPage}
        />
      </div>
    {/if}
  </div>
</Card>
