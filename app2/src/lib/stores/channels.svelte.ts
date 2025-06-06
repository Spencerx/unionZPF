import type { FetchDecodeGraphqlError } from "$lib/utils/queries"
import type { Channels } from "@unionlabs/sdk/schema"
import { Option } from "effect"
import type { TimeoutException } from "effect/Cause"

class ChannelsStore {
  data: Option.Option<typeof Channels.Type> = $state(Option.none())
  error: Option.Option<FetchDecodeGraphqlError | TimeoutException> = $state(Option.none())
}

export const channels = new ChannelsStore()
