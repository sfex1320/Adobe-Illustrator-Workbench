/** Prepared, owned PDF resources. No live Illustrator objects leave the adapter. */
export interface RasterJob {
  protocol: 1;
  jobId: string;
  pages: Array<{index:number;pdf:string;output:string;sizePt:[number,number]}>;
  folder: string;
  format: 'jpeg'|'png'|'tif';
  color: 'rgb'|'cmyk';
  ppi: number;
  scale: number;
  quality: number;
  transparent: boolean;
  profile: 'source'|'standard'|'custom';
  iccPath: string;
  optimize: boolean;
  smoothing?: 'standard'|'high';
  spotPolicy?: 'reject'|'preview';
}
