import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/public.decorator';
import { NetworkAdmin } from '../common/network-admin.decorator';
import { operationalWriteStatus } from '../common/operational-write-gate';

@Controller('api/v1')
export class ArchitectureController {
  constructor(private readonly prisma: PrismaService) {}
  @Public()
  @Get('health')
  async health(){await this.prisma.$queryRaw`SELECT 1`;const writes=operationalWriteStatus();return {ok:true,service:'imperio-backend',release:'V98b',operationalWritesEnabled:writes.enabled,operationalWriteUnits:writes.allowedUnits};}
  @Get('architecture/readiness')
  @NetworkAdmin()
  async readiness(){
    const [units,users,envelopes,clientUnitLinks]=await Promise.all([this.prisma.unit.count(),this.prisma.user.count(),this.prisma.migrationEnvelope.count({where:{status:'IMPORTED'}}),this.prisma.clientUnitLink.count({where:{active:true}})]);
    const writes=operationalWriteStatus();
    return {release:'V98b',database:'postgresql',orm:'prisma',auth:'opaque_server_session',unitAuthorization:'server_side',operationalWritesEnabled:writes.enabled,operationalWriteUnits:writes.allowedUnits,migrationImportEnabled:String(process.env.MIGRATION_IMPORT_ENABLED||'false')==='true',shadowReadsEnabled:String(process.env.SHADOW_READS_ENABLED||'false')==='true',readThroughEnabled:String(process.env.READ_THROUGH_ENABLED||'false')==='true',counts:{units,users,importedEnvelopes:envelopes,clientUnitLinks}};
  }
}
