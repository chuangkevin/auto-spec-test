declare namespace NodeJS {
  interface ProcessEnv {
    PORT?: string;
    HOST?: string;
    JWT_SECRET?: string;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    DEFAULT_ADMIN_USERNAME?: string;
    DEFAULT_ADMIN_PASSWORD?: string;
    DEFAULT_ADMIN_EMAIL?: string;
  }
}
