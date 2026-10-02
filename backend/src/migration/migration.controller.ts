import { Body, Controller, Get, Param, Post, Query, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { NetworkAdmin } from '../common/network-admin.decorator';
import { ImportService } from './import.service';
import { ClientBatchService } from './client-batch.service';
import type { ImperioRequest } from '../common/request-context';

@Controller('api/v1/migrations/v94')
@NetworkAdmin()
export class MigrationController {
  constructor(private readonly importer: ImportService, private readonly clientBatches: ClientBatchService) {}
  @Post('validate') validate(@Body() body: unknown) { return this.importer.validate(body); }
  @Post('import') import(@Body() body: unknown, @Query('mode') mode?: string) { return this.importer.importEnvelope(body, mode === 'commit' ? 'commit' : 'dry-run'); }
  @Get('imports') imports(){ return this.importer.listImports(); }
  @Get('imports/:id/cutover-report') cutoverReport(@Param('id') id:string){ return this.importer.cutoverReport(id); }
  @Post('purge-staging') purgeStaging(){ return this.importer.purgeExpiredStaging(); }
  @Post('clients/batches/excel/dry-run')
  @UseInterceptors(FilesInterceptor('files',3,{limits:{fileSize:12*1024*1024,files:3}}))
  clientBatchExcelDryRun(@UploadedFiles() files: any[], @Body() body: unknown){ return this.clientBatches.dryRunExcel(files||[],body); }
  @Post('clients/batches/dry-run') clientBatchDryRun(@Body() body: unknown){ return this.clientBatches.dryRun(body); }
  @Get('clients/batches/:batchId/report') clientBatchReport(@Param('batchId') batchId:string){ return this.clientBatches.report(batchId); }
  @Post('clients/batches/:batchId/finalize-staging')
  clientBatchFinalize(@Param('batchId') batchId:string,@Body() body:unknown,@Req() req:ImperioRequest){ return this.clientBatches.finalizeStaging(batchId,body as any,req.principal!.userId); }
  @Post('clients/batches/commit') clientBatchCommit(@Body() body: unknown){ return this.clientBatches.commit(body); }
}
