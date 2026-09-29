import { SetMetadata } from '@nestjs/common';
export const UNIT_SCOPE_KEY = 'imperio:unitScope';
export const UnitScoped = () => SetMetadata(UNIT_SCOPE_KEY, true);
