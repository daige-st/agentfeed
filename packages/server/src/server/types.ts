export type AppEnv = {
  Variables: {
    authType: "api" | "session";
    authId: string;
    authName: string;
    apiKeyId: string;
  };
};
