import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { NetworkAdmin } from '../common/network-admin.decorator';
import { ImportService } from './import.service';
import { ClientBatchService } from './client-batch.service';

@Controller('api/v1/migrations/v94')
@NetworkAdmin()
export class MigrationController {
  constructor(private readonly importer: ImportService, private readonly clientBatches: ClientBatchService) {}
  @Post('validate') validate(@Body() body: unknown) { return this.importer.validate(body); }
  @Post('import') import(@Body() body: unknown, @Query('mode') mode?: string) { return this.importer.importEnvelope(body, mode === 'commit' ? 'commit' : 'dry-run'); }
  @Get('imports') imports(){ return this.importer.listImports(); }
  @Get('imports/:id/cutover-report') cutoverReport(@Param('id') id:string){ return this.importer.cutoverReport(id); }
  @Post('purge-staging') purgeStaging(){ return this.importer.purgeExpiredStaging(); }
  @Post('clients/batches/dry-run') clientBatchDryRun(@Body() body: unknown){ return this.clientBatches.dryRun(body); }
  @Get('clients/batches/:batchId/report') clientBatchReport(@Param('batchId') batchId:string){ return this.clientBatches.report(batchId); }
  @Post('clients/batches/commit') clientBatchCommit(@Body() body: unknown){ return this.clientBatches.commit(body); }
}
