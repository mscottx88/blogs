import * as Base from '../base';

export interface IServiceConfig extends Base.IServiceConfig {
  length: number;
}

export interface IServiceOptions extends Base.IServiceOptions {
  config: IServiceConfig;
}
