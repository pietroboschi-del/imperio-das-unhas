import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { MigrationController } from './migration.controller';
import { ClientBatchService } from './client-batch.service';
import { ClientDuplicateReviewController } from './client-duplicate-review.controller';
import { ClientDuplicateReviewService } from './client-duplicate-review.service';
@Module({ controllers:[MigrationController,ClientDuplicateReviewController], providers:[ImportService,ClientBatchService,ClientDuplicateReviewService], exports:[ImportService,ClientBatchService,ClientDuplicateReviewService] })
export class MigrationModule {}
