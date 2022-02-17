import * as Base from '../base';

export interface IServiceConfig extends Base.IServiceConfig {
  diameter: number;
}

export interface IServiceOptions extends Base.IServiceOptions {
  config: IServiceConfig;
}
