import * as Authorization from '../../authorization';
import { IServiceConfig, IServiceOptions } from './schemata';

export abstract class Base {
  public static async getConfig(
    options: Partial<IServiceConfig> = {}
  ): Promise<IServiceConfig> {
    const {
      authorization,
      tableName = process.env.TABLE_NAME,
      timeoutMS = Infinity,
      zone = 0,
    }: Partial<IServiceConfig> = options;

    if (!tableName) {
      throw new Error('Missing required configuration parameter tableName.');
    }

    return {
      authorization: await Authorization.Service.getConfig(authorization),
      tableName,
      timeoutMS,
      zone
    };
  }

  public readonly config: IServiceConfig;

  constructor(options: IServiceOptions) {
    const { config }: IServiceOptions = options;
    const { authorization }: IServiceConfig = config;
    this.config = config;
  }

  public abstract assemble(): Promise<void>;
}

export { Base as Service };
