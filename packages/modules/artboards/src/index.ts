import type {ModuleBundle} from '@aiq/contracts';
import {MODULE_CONTRACT_VERSION} from '@aiq/contracts';
import {ArtboardPanel} from './ArtboardPanel.js';

export const moduleBundle:ModuleBundle={
 manifest:{id:'artboards',title:'画板管理',description:'画板尺寸、创建、排列与命名',version:'0.1.0',contractVersion:MODULE_CONTRACT_VERSION,icon:'doc',requiredCapabilities:['editorTools'],optionalCapabilities:[],commands:[],panelContributions:[{id:'main',navTitle:'画板',icon:'doc',viewKind:'module-view'}],settingsVersion:1,tools:[{id:'artboards',title:'画板管理',description:'预设、尺寸、适合选区、排列及命名',icon:'doc',viewId:'main'}],moduleDependencies:[],defaultEnabled:true},
 implementation:{async onActivate(){},async onDeactivate(){},async runCommand(){}}
};
export const moduleViews={main:ArtboardPanel};
