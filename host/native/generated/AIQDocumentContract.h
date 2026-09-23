// Generated from reviewed AIDocumentSuite 21. Do not edit offsets.
// Source SHA256: 037b9514492997fe3fd6a7286652d33f2579feb67533587711dc24959579c2a8
#pragma once
#include <cstddef>
#include <cstdint>
static_assert(sizeof(void*) == 8, "Win64 only");
struct AIQRealRect { double left, top, right, bottom; };
static_assert(sizeof(AIQRealRect) == 32, "SDK real rectangle ABI");
struct AIQDocumentSuite21 {
    void (*reserved0)(); // GetDocumentFileSpecification; never called
    void (*reserved1)(); // GetDocumentFileSpecificationFromHandle; never called
    void (*reserved2)(); // GetDocumentPageOrigin; never called
    void (*reserved3)(); // SetDocumentPageOrigin; never called
    void (*reserved4)(); // SetDocumentRulerOrigin; never called
    void (*reserved5)(); // GetDocumentRulerUnits; never called
    void (*reserved6)(); // SetDocumentRulerUnits; never called
    void (*reserved7)(); // GetDocumentCropStyle; never called
    void (*reserved8)(); // SetDocumentCropStyle; never called
    void (*reserved9)(); // GetDocumentPrintRecord; never called
    void (*reserved10)(); // SetDocumentPrintRecord; never called
    void (*reserved11)(); // GetDocumentSetup; never called
    void (*reserved12)(); // SetDocumentSetup; never called
    void (*reserved13)(); // GetDocumentModified; never called
    void (*reserved14)(); // SetDocumentModified; never called
    void (*reserved15)(); // GetDocumentFileFormat; never called
    void (*reserved16)(); // SetDocumentFileFormat; never called
    void (*reserved17)(); // GetDocumentFileFormatParameters; never called
    void (*reserved18)(); // SetDocumentFileFormatParameters; never called
    void (*reserved19)(); // RedrawDocument; never called
    std::int32_t (*GetDocument)(void** document);
    void (*reserved21)(); // WriteDocument; never called
    void (*reserved22)(); // GetDocumentMiPrintRecord; never called
    void (*reserved23)(); // SetDocumentMiPrintRecord; never called
    void (*reserved24)(); // GetDocumentRulerOrigin; never called
    void (*reserved25)(); // UpdateLinks; never called
    void (*reserved26)(); // GetDocumentZoomLimit; never called
    void (*reserved27)(); // GetDocumentMaxArtboardBounds; never called
    void (*reserved28)(); // DocumentExists; never called
    void (*reserved29)(); // GetDictionary; never called
    void (*reserved30)(); // GetDocumentColorModel; never called
    void (*reserved31)(); // SetDocumentColorModel; never called
    void (*reserved32)(); // GetDocumentProfiles; never called
    void (*reserved33)(); // SetDocumentProfiles; never called
    void (*reserved34)(); // Copy; never called
    void (*reserved35)(); // Cut; never called
    void (*reserved36)(); // Paste; never called
    void (*reserved37)(); // SyncDocument; never called
    void (*reserved38)(); // GetDocumentTargeting; never called
    void (*reserved39)(); // SetDocumentTargeting; never called
    void (*reserved40)(); // GetNonRecordedDictionary; never called
    void (*reserved41)(); // GetNonRecordedDictionaryForDocument; never called
    void (*reserved42)(); // GetAIVersion; never called
    void (*reserved43)(); // DocumentHasTransparency; never called
    void (*reserved44)(); // DocumentHasSpotColorArt; never called
    void (*reserved45)(); // GetDocumentAssetMgmtInfo; never called
    void (*reserved46)(); // SetDocumentAssetMgmtInfo; never called
    void (*reserved47)(); // GetDocumentURL; never called
    void (*reserved48)(); // GetDocumentXAP; never called
    void (*reserved49)(); // SetDocumentXAP; never called
    void (*reserved50)(); // SuspendTextReflow; never called
    void (*reserved51)(); // ResumeTextReflow; never called
    void (*reserved52)(); // GetTextSelection; never called
    void (*reserved53)(); // HasTextFocus; never called
    void (*reserved54)(); // HasTextCaret; never called
    void (*reserved55)(); // GetTextFocus; never called
    void (*reserved56)(); // SetTextFocus; never called
    void (*reserved57)(); // LoseTextFocus; never called
    void (*reserved58)(); // GetDocumentTextResources; never called
    void (*reserved59)(); // WriteDocumentMacInformationResource; never called
    void (*reserved60)(); // WriteDocumentWithOptions; never called
    void (*reserved61)(); // WriteDocumentAsLibrary; never called
    void (*reserved62)(); // DocumentHasOverprint; never called
    void (*reserved63)(); // DocumentHasManagedLinks; never called
    void (*reserved64)(); // GetDocumentSpotColorMode; never called
    void (*reserved65)(); // SetDocumentSpotColorMode; never called
    void (*reserved66)(); // Undo; never called
    void (*reserved67)(); // Redo; never called
    void (*reserved68)(); // DocumentRasterAttributes; never called
    void (*reserved69)(); // GetDocumentStartupProfile; never called
    std::int32_t (*GetDocumentBleeds)(AIQRealRect* bleed);
    std::int32_t (*SetDocumentBleeds)(const AIQRealRect& bleed);
    void (*reserved72)(); // SetDocumentPixelPerfectStatus; never called
    void (*reserved73)(); // GetDocumentPixelPerfectStatus; never called
    void (*reserved74)(); // DeleteSelection; never called
    void (*reserved75)(); // SetAutoAssignUIDOnArtCreation; never called
    void (*reserved76)(); // GetAutoAssignUIDOnArtCreation; never called
    void (*reserved77)(); // GetEffectiveScaleFactor; never called
    void (*reserved78)(); // GetDocumentScale; never called
    void (*reserved79)(); // IsCloudAIDocument; never called
    void (*reserved80)(); // GetDocumentFileName; never called
    void (*reserved81)(); // GetDocumentFileNameNoExt; never called
    void (*reserved82)(); // GetDocumentFileNameFromHandle; never called
    void (*reserved83)(); // GetDocumentFileNameNoExtFromHandle; never called
    void (*reserved84)(); // GetLastExportedFilePath; never called
    void (*reserved85)(); // SetLastExportedFilePath; never called
};
static_assert(offsetof(AIQDocumentSuite21, GetDocument) == 20 * sizeof(void*), "SDK member order");
static_assert(offsetof(AIQDocumentSuite21, GetDocumentBleeds) == 70 * sizeof(void*), "SDK member order");
static_assert(offsetof(AIQDocumentSuite21, SetDocumentBleeds) == 71 * sizeof(void*), "SDK member order");
static_assert(sizeof(AIQDocumentSuite21) == 86 * sizeof(void*), "SDK suite size");
