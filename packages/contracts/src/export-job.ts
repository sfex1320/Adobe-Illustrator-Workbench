import type {RasterJob} from './raster-export.js';
export type ExportJobPhase = 'preparing'|'snapshot'|'opening'|'pdf'|'prepared'|'rendering'|'encoding'|'validating'|'publishing'|'completed'|'partial'|'cancelled'|'failed'|'host-uncertain';
/** One-use handoff from the host after cleanup; never a persisted document reference. */
export interface PreparedExportReceipt {
  schema:1;
  jobId:string;
  requestKey:string;
  workingDocumentClosed:true;
  job:RasterJob;
}
