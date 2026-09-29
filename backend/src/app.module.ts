import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MigrationModule } from './migration/migration.module';
import { CoreModule } from './core/core.module';
import { ArchitectureModule } from './architecture/architecture.module';
import { ShadowModule } from './shadow/shadow.module';
import { ReadThroughModule } from './read-through/read-through.module';
import { SessionGuard } from './auth/session.guard';
import { CsrfGuard } from './auth/csrf.guard';
import { AccessGuard } from './auth/access.guard';

@Module({
  imports:[PrismaModule,AuthModule,MigrationModule,CoreModule,ArchitectureModule,ShadowModule,ReadThroughModule],
  providers:[
    {provide:APP_GUARD,useClass:SessionGuard},
    {provide:APP_GUARD,useClass:CsrfGuard},
    {provide:APP_GUARD,useClass:AccessGuard},
  ],
})
export class AppModule {}
