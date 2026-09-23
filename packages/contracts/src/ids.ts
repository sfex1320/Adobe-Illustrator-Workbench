/** 品牌与工程级常量。宿主扩展 ID、设置命名空间等在此集中定义。 */

export const APP_ID = 'com.aiq.workbench' as const;
export const APP_TITLE = 'Illustrator 效率工作台' as const;

/** 模块契约版本。manifest.contractVersion 与此不符时拒绝注册。 */
export const MODULE_CONTRACT_VERSION = 1 as const;

/** 用户设置持久化命名空间（localStorage / 宿主存储键）。 */
export const SETTINGS_STORAGE_KEY = 'aiq.settings.v1' as const;

/** 演示适配器身份。任何来自演示适配器的数据都必须伴随 adapterKind='demo' 标记。 */
export const DEMO_ADAPTER_KIND = 'demo' as const;
export const CEP_ADAPTER_KIND = 'cep' as const;
