export type StyleField='fill'|'fillColor'|'stroke'|'strokeColor'|'strokeWidth'|'width'|'size'|'textStyle'|'fontSize'|'fontHeight'|'textFrameSize';
export interface StyleSampleRow {index:number;name:string;kind:string;depth:number;fields:Array<{key:StyleField;label:string;value:string}>;warnings:string[]}
export interface StyleSample {token:string;docSessionId:string;rows:StyleSampleRow[]}
export type StyleTransferAction={type:'style-transfer';operation:'capture'|'locate'|'apply';sampleToken?:string;row?:number;fields?:StyleField[]};
