<script lang="ts">
import LongMonoWord from "$lib/components/ui/LongMonoWord.svelte"
import Tooltip from "$lib/components/ui/Tooltip.svelte"
import Truncate from "$lib/components/ui/Truncate.svelte"
import { cn } from "$lib/utils"
import type { HTMLAttributes } from "svelte/elements"

type Props = HTMLAttributes<HTMLDivElement> & {
  hash: string
  class?: string
}

const { hash, class: className = "", ...rest }: Props = $props()
</script>

<Tooltip title="Packet Hash">
  {#snippet trigger()}
    <Truncate
      class={cn("font-mono break-all", className)}
      {...rest}
      showCopy={false}
      value={hash}
      maxLength={12}
    />
  {/snippet}

  {#snippet content()}
    <section>
      <LongMonoWord>
        {hash}
      </LongMonoWord>
    </section>
  {/snippet}
</Tooltip>
