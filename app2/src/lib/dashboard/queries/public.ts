import { extractErrorDetails } from "@unionlabs/sdk/utils"
import { Effect, Option, pipe } from "effect"
import { type Entity, SupabaseClient } from "../client"
import { CACHE_VERSION, STALE, TTL } from "../config"
import {
  AchievementError,
  CategoryError,
  ChainError,
  LeaderboardError,
  MissionError,
  RewardError,
  SupabaseError,
} from "../errors"
import { withLocalStorageCacheStale } from "../services/cache"
import { errorStore } from "../stores/errors.svelte"
import { retryForever } from "./retry"

export type Achievement = Entity<"achievements">
export type Level = Entity<"levels">
export type Category = Entity<"categories">
export type UserExperience = Entity<"user_levels">
export type Mission = Entity<"missions">
export type Reward = Entity<"rewards">
export type YapsSeason = {
  user_id: string | null
  username: string | null
  mindshare: string | null
  twitter_id: number | null
  pfp: string | null
  team: boolean | null
}

export const getChains = () =>
  withLocalStorageCacheStale(
    "public",
    `${CACHE_VERSION}:chains`,
    TTL,
    STALE,
    pipe(
      SupabaseClient,
      Effect.flatMap((client) =>
        Effect.tryPromise({
          try: () => client.from("chains").select("*"),
          catch: (error) =>
            new SupabaseError({
              operation: "loadChains",
              cause: extractErrorDetails(error as Error),
            }),
        })
      ),
      Effect.retry(retryForever),
      Effect.map(({ data }) => Option.fromNullable(data)),
      Effect.catchAll((error) => {
        errorStore.showError(new ChainError({ cause: error, operation: "load" }))
        return Effect.succeed(Option.none())
      }),
    ),
  )

export const getAvailableAchievements = () =>
  withLocalStorageCacheStale(
    "public",
    `${CACHE_VERSION}:achievements`,
    TTL,
    STALE,
    pipe(
      SupabaseClient,
      Effect.flatMap((client) =>
        Effect.tryPromise({
          try: () =>
            client
              .from("achievements")
              .select(`
                *,
                reward_achievements(rewards(*)),
                category:categories!achievements_category_fkey(id, title),
                subcategory:categories!achievements_subcategory_fkey(id, title)
              `),
          catch: (error) =>
            new SupabaseError({
              operation: "loadAchievements",
              cause: extractErrorDetails(error as Error),
            }),
        })
      ),
      Effect.retry(retryForever),
      Effect.map(({ data }) => Option.fromNullable(data)),
      Effect.catchAll((error) => {
        errorStore.showError(new AchievementError({ cause: error, operation: "loadAvailable" }))
        return Effect.succeed(Option.none())
      }),
    ),
  )

export const getAvailableLevels = () =>
  withLocalStorageCacheStale(
    "public",
    `${CACHE_VERSION}:levels`,
    TTL,
    STALE,
    pipe(
      SupabaseClient,
      Effect.flatMap((client) =>
        Effect.tryPromise({
          try: () =>
            client
              .from("levels")
              .select("*")
              .order("experience_required", { ascending: true }),
          catch: (error) =>
            new SupabaseError({
              operation: "loadLevels",
              cause: extractErrorDetails(error as Error),
            }),
        })
      ),
      Effect.retry(retryForever),
      Effect.map(({ data }) => Option.fromNullable(data)),
      Effect.catchAll((error) => {
        errorStore.showError(new LeaderboardError({ cause: error, operation: "loadLevels" }))
        return Effect.succeed(Option.none())
      }),
    ),
  )

export const getCategories = () =>
  withLocalStorageCacheStale(
    "public",
    `${CACHE_VERSION}:categories`,
    TTL,
    STALE,
    pipe(
      SupabaseClient,
      Effect.flatMap((client) =>
        Effect.tryPromise({
          try: () => client.from("categories").select("*"),
          catch: (error) =>
            new SupabaseError({
              operation: "loadCategories",
              cause: extractErrorDetails(error as Error),
            }),
        })
      ),
      Effect.retry(retryForever),
      Effect.map(({ data }) => Option.fromNullable(data)),
      Effect.catchAll((error) => {
        errorStore.showError(new CategoryError({ cause: error, operation: "load" }))
        return Effect.succeed(Option.none())
      }),
    ),
  )

export const getLeaderboard = () =>
  withLocalStorageCacheStale(
    "public",
    `${CACHE_VERSION}:leaderboard`,
    TTL,
    STALE,
    pipe(
      SupabaseClient,
      Effect.flatMap((client) =>
        Effect.tryPromise({
          try: () =>
            client
              .from("user_levels")
              .select("*")
              .order("total_xp", { ascending: false })
              .limit(50),
          catch: (error) =>
            new SupabaseError({
              operation: "loadLeaderboard",
              cause: extractErrorDetails(error as Error),
            }),
        })
      ),
      Effect.retry(retryForever),
      Effect.map(({ data }) => Option.fromNullable(data)),
      Effect.catchAll((error) => {
        errorStore.showError(new LeaderboardError({ cause: error, operation: "load" }))
        return Effect.succeed(Option.none())
      }),
    ),
  )

export const getAvailableMissions = () =>
  withLocalStorageCacheStale(
    "public",
    `${CACHE_VERSION}:missions`,
    TTL,
    STALE,
    pipe(
      SupabaseClient,
      Effect.flatMap((client) =>
        Effect.tryPromise({
          try: () =>
            client
              .from("missions")
              .select("*")
              .order("priority", { ascending: false }),
          catch: (error) =>
            new SupabaseError({
              operation: "loadMissions",
              cause: extractErrorDetails(error as Error),
            }),
        })
      ),
      Effect.retry(retryForever),
      Effect.map(({ data }) => Option.fromNullable(data)),
      Effect.catchAll((error) => {
        errorStore.showError(new MissionError({ cause: error, operation: "loadAvailable" }))
        return Effect.succeed(Option.none())
      }),
    ),
  )

export const getAvailableRewards = () =>
  withLocalStorageCacheStale(
    "public",
    `${CACHE_VERSION}:rewards`,
    TTL,
    STALE,
    pipe(
      SupabaseClient,
      Effect.flatMap((client) =>
        Effect.tryPromise({
          try: () => client.from("rewards").select("*"),
          catch: (error) =>
            new SupabaseError({
              operation: "loadRewards",
              cause: extractErrorDetails(error as Error),
            }),
        })
      ),
      Effect.retry(retryForever),
      Effect.map(({ data }) => Option.fromNullable(data)),
      Effect.catchAll((error) => {
        errorStore.showError(new RewardError({ cause: error, operation: "loadAvailable" }))
        return Effect.succeed(Option.none())
      }),
    ),
  )

export const getYapsSeason0 = () =>
  withLocalStorageCacheStale(
    "public",
    `${CACHE_VERSION}:yaps_season_0`,
    TTL,
    STALE,
    pipe(
      SupabaseClient,
      Effect.flatMap((client) =>
        Effect.tryPromise({
          try: () =>
            client
              .from("yaps_season_zero_with_users")
              .select("user_id, username, mindshare, twitter_id, pfp, team")
              .order("rank", { ascending: true })
              .limit(20000),
          catch: (error) =>
            new SupabaseError({
              operation: "loadYapsSeason0",
              cause: extractErrorDetails(error as Error),
            }),
        })
      ),
      Effect.retry(retryForever),
      Effect.map(({ data }) => Option.fromNullable(data)),
      Effect.catchAll((error) => {
        errorStore.showError(new LeaderboardError({ cause: error, operation: "loadYapsSeason0" }))
        return Effect.succeed(Option.none())
      }),
    ),
  )

export const getYapsSeason1 = () =>
  withLocalStorageCacheStale(
    "public",
    `${CACHE_VERSION}:yaps_season_1`,
    TTL,
    STALE,
    pipe(
      SupabaseClient,
      Effect.flatMap((client) =>
        Effect.tryPromise({
          try: () =>
            client
              .from("yaps_season_one_with_users")
              .select("user_id, username, mindshare, twitter_id, pfp, team")
              .order("rank", { ascending: true })
              .limit(20000),
          catch: (error) =>
            new SupabaseError({
              operation: "loadYapsSeason1",
              cause: extractErrorDetails(error as Error),
            }),
        })
      ),
      Effect.retry(retryForever),
      Effect.map(({ data }) => Option.fromNullable(data)),
      Effect.catchAll((error) => {
        errorStore.showError(new LeaderboardError({ cause: error, operation: "loadYapsSeason1" }))
        return Effect.succeed(Option.none())
      }),
    ),
  )
