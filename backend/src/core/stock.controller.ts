import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Authenticated } from '../common/authenticated.decorator';
import { NetworkAdmin } from '../common/network-admin.decorator';
import type { ImperioRequest } from '../common/request-context';
import { StockService } from './stock.service';

@Controller('api/v1/stock')
export class StockController {
  constructor(private readonly stock:StockService){}

  @Get('locations')
  @Authenticated()
  locations(@Req() req:ImperioRequest){return this.stock.locations(req.principal!)}

  @Get('products')
  @Authenticated()
  products(@Req() req:ImperioRequest){return this.stock.products(req.principal!)}

  @Post('products')
  @Authenticated()
  createProduct(@Req() req:ImperioRequest,@Body() body:any){return this.stock.upsertProduct(req.principal!,body)}

  @Patch('products/:id')
  @Authenticated()
  updateProduct(@Req() req:ImperioRequest,@Param('id') id:string,@Body() body:any){return this.stock.upsertProduct(req.principal!,body,id)}

  @Get('balances')
  @Authenticated()
  balances(@Req() req:ImperioRequest,@Query('locationId') locationId?:string){return this.stock.balances(req.principal!,locationId)}

  @Get('movements')
  @Authenticated()
  movements(@Req() req:ImperioRequest,@Query('locationId') locationId?:string){return this.stock.movements(req.principal!,locationId)}

  @Get('purchases')
  @Authenticated()
  purchases(@Req() req:ImperioRequest,@Query('locationId') locationId?:string){return this.stock.purchases(req.principal!,locationId)}

  @Post('purchases')
  @Authenticated()
  purchase(@Req() req:ImperioRequest,@Body() body:any,@Headers('idempotency-key') key?:string){return this.stock.purchase(req.principal!,body,key)}

  @Post('consumptions')
  @Authenticated()
  consume(@Req() req:ImperioRequest,@Body() body:any,@Headers('idempotency-key') key?:string){return this.stock.consume(req.principal!,body,key)}

  @Post('inventory')
  @Authenticated()
  inventory(@Req() req:ImperioRequest,@Body() body:any,@Headers('idempotency-key') key?:string){return this.stock.inventory(req.principal!,body,key)}

  @Get('transfers')
  @Authenticated()
  transfers(@Req() req:ImperioRequest){return this.stock.transfers(req.principal!)}

  @Post('transfers')
  @Authenticated()
  createTransfer(@Req() req:ImperioRequest,@Body() body:any,@Headers('idempotency-key') key?:string){return this.stock.createTransfer(req.principal!,body,key)}

  @Post('transfers/:id/send')
  @Authenticated()
  sendTransfer(@Req() req:ImperioRequest,@Param('id') id:string){return this.stock.sendTransfer(req.principal!,id)}

  @Post('transfers/:id/receive')
  @Authenticated()
  receiveTransfer(@Req() req:ImperioRequest,@Param('id') id:string){return this.stock.receiveTransfer(req.principal!,id)}

  @Post('opening-balances/apply')
  @NetworkAdmin()
  applyOpening(@Req() req:ImperioRequest){return this.stock.applyOpeningBalances(req.principal!)}
}
