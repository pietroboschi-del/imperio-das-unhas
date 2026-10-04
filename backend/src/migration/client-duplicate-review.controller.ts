import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { RequirePermissions } from '../common/permissions.decorator';
import type { ImperioRequest } from '../common/request-context';
import { ClientDuplicateReviewService } from './client-duplicate-review.service';

class DuplicateReviewDecisionDto {
  @IsIn(['MERGE','KEEP_SEPARATE','KEEP_CENTRAL','REVIEW_LATER'])
  decision!: 'MERGE'|'KEEP_SEPARATE'|'KEEP_CENTRAL'|'REVIEW_LATER';

  @IsOptional()
  @IsString()
  targetClusterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@Controller('api/v1/client-duplicate-reviews')
@RequirePermissions('clients.duplicates.review')
export class ClientDuplicateReviewController {
  constructor(private readonly reviews: ClientDuplicateReviewService) {}

  @Get(':batchId')
  queue(@Param('batchId') batchId:string) {
    return this.reviews.queue(batchId);
  }

  @Post(':batchId/:clusterId')
  decide(
    @Param('batchId') batchId:string,
    @Param('clusterId') clusterId:string,
    @Body() body:DuplicateReviewDecisionDto,
    @Req() req:ImperioRequest,
  ) {
    return this.reviews.decide(batchId,clusterId,body,req.principal!.userId);
  }
}
