import { SetMetadata } from '@nestjs/common';
export const NETWORK_ADMIN_KEY = 'imperio:networkAdmin';
export const NetworkAdmin = () => SetMetadata(NETWORK_ADMIN_KEY, true);
