/// <reference types="vite/client" />
declare module '*.tmj?raw' { const raw: string; export default raw; }

interface ImportMetaEnv {
  /** HTTPS origin of the hosted party server; empty when the server also serves these pages. */
  readonly VITE_PARTY_ORIGIN?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
