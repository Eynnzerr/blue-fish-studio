/// <reference types="vite/client" />

/** Optional public endpoint configuration embedded in the frontend bundle. */
interface ImportMetaEnv {
  /** Complete statistics read URL, without a trailing slash or any secret. */
  readonly VITE_STATS_API_URL?: string;
}
