export interface ICredentials {
  password: string;
  username: string;
}

export interface IServiceConfig {
  credentials: ICredentials;
  url: string;
}

export interface IServiceOptions {
  config: IServiceConfig;
}
