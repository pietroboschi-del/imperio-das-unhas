import { SetMetadata } from '@nestjs/common';
export const AUTHENTICATED_KEY = 'imperio:authenticated';
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);
