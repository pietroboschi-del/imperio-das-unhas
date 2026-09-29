import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { NetworkAdmin } from '../common/network-admin.decorator';
import { ImportService } from './import.service';

@Controller('api/v1/migrations/v94')
@NetworkAdmin()
export class MigrationController {
  constructor(private readonly importer: ImportService) {}
  @Post('validate') validate(@Body() body: unknown) { return this.importer.validate(body); }
  @Post('import') import(@Body() body: unknown, @Query('mode') mode?: string) { return this.importer.importEnvelope(body, mode === 'commit' ? 'commit' : 'dry-run'); }
  @Get('imports') imports(){ return this.importer.listImports(); }
  @Get('imports/:id/cutover-report') cutoverReport(@Param('id') id:string){ return this.importer.cutoverReport(id); }
  @Post('purge-staging') purgeStaging(){ return this.importer.purgeExpiredStaging(); }
}
