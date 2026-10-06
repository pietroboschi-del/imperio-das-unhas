export const CANONICAL_MESSAGING_CHANNELS = Object.freeze([
  {id:'CENTRAL',provider:'EVOLUTION',enabled:false},
  {id:'BIG_CENTRO',provider:'EVOLUTION',enabled:false},
  {id:'SHOPPING_CONTAGEM',provider:'EVOLUTION',enabled:false},
] as const);

export type MessagingChannelId=(typeof CANONICAL_MESSAGING_CHANNELS)[number]['id'];

export const CANONICAL_MESSAGING_CHANNEL_IDS=Object.freeze(
  CANONICAL_MESSAGING_CHANNELS.map(channel=>channel.id) as MessagingChannelId[],
);

export const UNIT_MESSAGING_CHANNEL_MAP=Object.freeze({
  big:'BIG_CENTRO',
  centro:'BIG_CENTRO',
  'shopping-contagem':'SHOPPING_CONTAGEM',
} as const satisfies Record<string,MessagingChannelId>);

export function isMessagingChannelId(value:string):value is MessagingChannelId{
  return CANONICAL_MESSAGING_CHANNEL_IDS.includes(value as MessagingChannelId);
}

export function channelForUnit(unitId:string):MessagingChannelId|null{
  const normalized=String(unitId||'').trim();
  return (UNIT_MESSAGING_CHANNEL_MAP as Readonly<Record<string,MessagingChannelId>>)[normalized]||null;
}

export function whatsappAutomationEnabled(env:NodeJS.ProcessEnv=process.env){
  return String(env.WHATSAPP_AUTOMATION_ENABLED||'false').trim().toLowerCase()==='true';
}
