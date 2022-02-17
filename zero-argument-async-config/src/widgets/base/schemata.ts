import * as Authorization from '../../authorization';

export interface IServiceConfig {
  authorization: Authorization.IServiceConfig;
  tableName: string;
  timeoutMS?: number;
  zone: number;
}

export interface IServiceOptions {
  config: IServiceConfig;
}
