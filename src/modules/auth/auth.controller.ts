import type { Ctx } from '../../http/types.js';
import { mustUser } from '../../http/context.js';
import type { LoginInput, RefreshInput, RegisterInput } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Bound as fields so they can be used as bare handler references in the route table.
  register = (ctx: Ctx) => this.auth.register(ctx.body as RegisterInput);
  login    = (ctx: Ctx) => this.auth.login(ctx.body as LoginInput);

  refresh = (ctx: Ctx) => {
    const dto = ctx.body as RefreshInput;
    return this.auth.refresh(dto.refreshToken, dto.deviceId);
  };

  logout = async (ctx: Ctx): Promise<undefined> => {
    await this.auth.logout((ctx.body as { refreshToken: string }).refreshToken);
    return undefined;                       // 204
  };

  me = (ctx: Ctx) => this.auth.me(mustUser(ctx).sub);
}
