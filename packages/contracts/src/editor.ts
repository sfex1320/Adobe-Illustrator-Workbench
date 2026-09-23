import type {StyleTransferAction,StyleSample} from './style-transfer.js';
import type {RasterJob} from './raster-export.js';
import type {ExportJobPhase} from './export-job.js';
import type {ProductivityAction, ProductivityRow} from './productivity.js';
import type { VariableAction, VariableTemplate, VariableResultRow } from './variable-data.js';
import type { Bounds, CommandResult } from './document.js';
export type RulerUnit = 'mm' | 'cm' | 'm' | 'in' | 'pt' | 'px' | 'pc' | 'Q';
export interface ExportAnnotation {
  color?: string; decimals?: number; area?: boolean; remark?: string; autoFont?: boolean;
  enabled: boolean; size: boolean; resolution: boolean; colors: boolean; bleed: boolean;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'left-center' | 'right-center'; offset: number;
}
export interface ExportNaming {
  enabled: boolean;
  blocks: Array<{ kind: 'remark'|'material'|'size'|'name'|'customer'|'bleed'; enabled: boolean; value: string }>;
  nameSource: 'document-artboard'|'artboard'|'custom';
  unit: RulerUnit;
  decimals: number;
}
export interface EditorObject {
  id: string; kind: string; bounds: Bounds;
  /** Root-to-leaf stacking positions, read only for selected roots. */
  stackOrder?: number[];
  fill: string | null; stroke: string | null; strokeWidth: number | null;
  font: string | null; fontSize: number | null; character?: Partial<CharacterSettings>; paragraph?: Partial<ParagraphSettings>;
}
export interface EditorState {
  bleedOffsets?: number[] | null; bleedError?: string;
  lastSelectedId?: string; layers?: EditorLayer[];
  token: string; docSessionId: string; docName?: string; selectionKey: string; unsaved: boolean;
  objects: EditorObject[]; bounds: Bounds | null;
  artboards: Array<{ index: number; name: string; bounds: Bounds }>;
  activeArtboard: number;
  selectedArtboards?: number[];
  artboardSelectionError?: string; symmetryPreview: boolean; capturedTargets: number; capturedSource?: boolean; textSelection: boolean;
  sourceFolder?: string; hasSaveLocation?: boolean; rulerUnit?: RulerUnit;
  nativeCommands?: string[];
  nativeSaveAsSupported?: boolean;
  rasterResolution?: number;
  colorSpace?: 'rgb' | 'cmyk';
  symmetry?: { axis: 'x' | 'y'; position: number; side: 'low' | 'high' };
}
export interface EditorFont { name: string; family: string; style: string }
/** Native identity, never an RGB preview of a CMYK or spot fill. */
export type TextFill = {kind:'none'} | {kind:'rgb';values:[number,number,number]} | {kind:'cmyk';values:[number,number,number,number]} | {kind:'gray';values:[number]} | {kind:'spot';name:string;tint:number;base:Exclude<TextFill,{kind:'spot'}|{kind:'none'}>};
export interface TextStyleSample {font?:string;fontFamily?:string;fontStyle?:string;fontSize?:number;fill?:TextFill}
/** Flattened visible geometry. Rings use Illustrator coordinates in points. */
export interface GroupRegion { rings?: Array<Array<[number,number]>>; evenodd?: boolean; children?: GroupRegion[]; clip?: GroupRegion; stroke?: {points:Array<[number,number]>;width:number;closed:boolean;cap:'butt'|'round'|'square';join:'miter'|'round'|'bevel';miterLimit:number} }
export interface CharacterSettings { font?: string; fontSize?: number; leading?: number; autoLeading?: boolean; tracking?: number; baselineShift?: number; horizontalScale?: number; verticalScale?: number; baseline?: 'normal'|'super'|'sub'; opacity?: number }
export interface ParagraphSettings { justification?: 'left'|'center'|'right'|'full-left'|'full-center'|'full-right'|'full'; leftIndent?: number; rightIndent?: number; firstLineIndent?: number; spaceBefore?: number; spaceAfter?: number; autoLeadingAmount?: number; hyphenation?: boolean; everyLineComposer?: boolean; minimumWordSpacing?: number; desiredWordSpacing?: number; maximumWordSpacing?: number; minimumLetterSpacing?: number; desiredLetterSpacing?: number; maximumLetterSpacing?: number; minimumGlyphScaling?: number; desiredGlyphScaling?: number; maximumGlyphScaling?: number }
export interface TextMatch { index: number; preview: string; count: number }
export interface ExportProgress {
  phase?: ExportJobPhase;
  prepared?: number;
  startedAt?: number;
  updatedAt?: number;
  message?: string;
  jobId: string; total: number; current: number; completed: number; failed: number;
  status: 'running'|'completed'|'partial'|'cancelled'|'failed';
  completedIndexes: number[];
}
export type EditorAction =
  | StyleTransferAction
  | ProductivityAction
  | VariableAction
  | { type:'package'; pdfCompatible?:boolean; folder:string; name:string; outline:boolean; formats:Array<'jpeg'|'png'|'pdf'>; splitPDF:boolean; outputSubfolder:string; report:'md'|'txt'|null; resolution:number; scale:number; colorMode:'source'|'rgb'|'cmyk'; jobId?:string }
  | { type: 'save'; nativeDialog?: boolean; saveAs?: boolean; format?: 'ai'|'pdf'|'eps'|'ait'|'svg'|'svgz'; folder?: string; fileName?: string }
  | { type: 'sample-text-style'; fields?:Array<'font'|'fontSize'|'fill'> }
  | { type: 'choose-folder' }
  | { type: 'open-folder'; folder: string }
  | { type: 'read-bleed' }
  | { type: 'set-bleed'; offsets: number[] }
  | { type: 'smart-group'; groups?: number[][] }
  | { type: 'ungroup-all' }
  | { type: 'measure-layout'; clip: 'frame'|'visible'; text: 'frame'|'glyph' }
  | { type: 'native-align'; clip?: 'frame'|'visible'; text?: 'frame'|'glyph'; axes?: Array<'left'|'right'|'top'|'bottom'|'h-center'|'v-center'>; distribute?: 'horizontal'|'vertical'; spacing?: 'centers'|'gaps'; edge?: 'start'|'end'; gap?: number; referenceId?: string }
  | { type: 'artboards-update'; boards: Array<{index:number;bounds:Bounds}>; moveArtwork: boolean; scaleArtwork?: boolean; artworkScale?: 'direct'|'width'|'height'|'bleed-width'|'bleed-height'|'bleed-direct'; bleedOffsets?: number[]; artworkAssignments?: number[] }
  | { type: 'layers'; operation: 'list'|'create'|'move'|'update'; source?: 'selection'|'artboards'; artboardIndexes?: number[]; layerId?: string; name?: string; color?: string; visible?: boolean; locked?: boolean }
  | { type: 'fonts' }
  | { type: 'text-list'; mode: 'bullet'|'number'|'clear' }
  | { type: 'text-format'; character?: CharacterSettings; paragraph?: ParagraphSettings }
  | { type: 'text-search'; query: string; scope: 'document'|'selection'|'artboard'|'layer'; operation: 'find'|'select'|'locate'|'replace'|'replace-font'|'replace-style'; replacement?: string; replacementFont?: string; replacementFamily?:string; replacementStyle?:string; replacementSize?:number; replacementFill?:TextFill; matchCase: boolean; wholeWord?: boolean; font?: string; fontStyle?: string; fontSize?: number; textFill?:TextFill; sizeCompare?: 'equal'|'greater'|'less'; searchToken?: string; matchIndexes?: number[] }
  | { type: 'object-search'; operation: 'find'|'select'|'locate'; scope: 'document'|'selection'|'artboard'|'layer'; same: Array<'fill'|'stroke'|'strokeWidth'|'kind'|'size'|'font'|'fontSize'>; excludeGroups: boolean; tolerance: number; width?: number; height?: number; sizeCompare: 'equal'|'greater'|'less'; name?: string; searchToken?: string; matchIndexes?: number[] }
  | { type: 'native'; command: string }
  | { type: 'text-case'; mode: 'upper' | 'lower' | 'title' | 'sentence' }
  | { type: 'rename-artboards'; names: Array<{index:number;name:string}> }
  | { type: 'annotate'; target: 'objects'|'artboards'|'gap'|'curve'; artboardIndexes?: number[]; horizontal: boolean; vertical: boolean; fontSize: number; bleedPoints: number; annotation: ExportAnnotation; linkToObjects?: boolean }
  | { type: 'annotate-remove'; annotation?: ExportAnnotation }
  | { type: 'path-length'; from?: number; to?: number; label?: boolean; fontSize?: number; annotation?: ExportAnnotation; linkToObjects?: boolean }
  | { type: 'pick-color'; target: 'fill' | 'stroke' }
  | { type: 'properties'; fill?: string; stroke?: string; strokeWidth?: number; font?: string; fontSize?: number }
  | { type: 'geometry'; transforms: Array<{ id: string; bounds: Bounds }>; scaleStrokes?: boolean }
  | { type: 'artboard'; index: number; operation: 'activate' | 'resize' | 'add' | 'fit' | 'from-selection'; boundsMode?: 'frame'|'overall'|'visible'; width?: number; height?: number; name?: string; margin?: number }
  | { type: 'color-mode'; mode: 'rgb' | 'cmyk' }
  | { type: 'capture-targets'; role?: 'source'|'targets'|'clear' }
  | { type: 'replace'; removeTargets: boolean; fit: boolean; scaleMode?: 'original'|'stretch'|'height'|'width'; sourceFirst?: boolean }
  | { type: 'outlines'; scope?: 'selection'|'document' }
  | { type: 'export'; collection?: boolean; rasterEngine?: 'independent'; rasterSmoothing?: 'standard'|'high'; rasterConvertSpots?: boolean; writeLayers?: boolean; rasterProfile?: 'source'|'standard'|'custom'; rasterIccPath?: string; rasterOptimize?: boolean; screenExport?: boolean; pdfCompatible?: boolean; jobId?: string; naming?: ExportNaming; compression?: boolean; antiAliasing?: boolean; outlineText?: boolean; overprintBlack?: boolean; openFolderAfterExport?: boolean; format: 'png' | 'jpeg' | 'svg' | 'pdf' | 'ai' | 'eps' | 'tif' | 'psd'; allArtboards: boolean; scale: number; folder?: string; sourceFolder?: boolean; resolution?: number; quality?: number; transparent?: boolean; preserveEditability?: boolean; embedImages?: boolean; target?: 'objects' | 'artboards'; artboardIndexes?: number[]; fileName?: string; namingMode?: 'prefix'|'name'; bleedPoints?: number; bleedMode?: 'manual'|'document'; useDocumentBleed?: boolean; colorMode?: 'source' | 'rgb' | 'cmyk'; createSubfolder?: boolean; subfolderName?: string; annotation?: ExportAnnotation }
  | { type: 'symmetry'; phase: 'preview' | 'sync' | 'commit' | 'cancel'; axis: 'x' | 'y'; position: number; side: 'low' | 'high' };
export interface EditorRequest { docSessionId: string; token: string; action: EditorAction }
export interface EditorLayer {id:string;name:string;color:string;visible:boolean;locked:boolean;depth:number}
export interface EditorResult { styleSample?:StyleSample; variableTargetId?:string }
export interface EditorResult extends CommandResult { productivityRows?: ProductivityRow[]; rasterJob?: RasterJob; matchKind?:'text'; textSample?:TextStyleSample; groupRegions?: GroupRegion[]; boardRegions?: GroupRegion[]; ownershipBoards?: Array<{index:number;bounds:Bounds}>; layers?:EditorLayer[]; variableTemplate?:VariableTemplate; variableRows?:VariableResultRow[]; exportProgress?: ExportProgress; exportMetrics?: {directPages:number;workingDocuments:number;copiedObjects:number;snapshotSaves?:number;screenBatches?:number}; message?: string; folder?: string; bleedOffsets?: number[]; measuredObjects?: EditorObject[]; files?: string[]; fileName?: string; fonts?: EditorFont[]; matches?: TextMatch[]; matchCount?: number; searchToken?: string; pathLength?: number }
