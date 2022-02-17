import { SomePartial } from '..';
import * as Base from '../base';
import { IServiceConfig, IServiceOptions } from './schemata';

export class Gadgets extends Base.Service {
  public static async getConfig(
    options: Partial<IServiceConfig> = {}
  ): Promise<IServiceConfig> {
    const { length = 0, ...rest }: Partial<IServiceConfig> = options;
    const config: Base.IServiceConfig = await super.getConfig(rest);
    return { ...rest, ...config, length };
  }

  public static async new(
    options: SomePartial<IServiceOptions, 'config'> = {}
  ): Promise<Gadgets> {
    const { config, ...rest }: SomePartial<IServiceOptions, 'config'> = options;
    return new this({ config: await this.getConfig(config), ...rest });
  }

  public readonly config: IServiceConfig;

  constructor(options: IServiceOptions) {
    super(options);
    const { config }: IServiceOptions = options;
    this.config = config;
  }

  public async assemble(): Promise<void> {}
}

export { Gadgets as Service };
