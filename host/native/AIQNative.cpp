// On-demand bridge. Reads plus explicit document-bleed writes; no polling or saves.
#include <cmath>
#include <cstdio>
#include <cstring>
#include <windows.h>
#include <wincodec.h>
#include <wrl/client.h>
#include <algorithm>
#include <cstdlib>
#pragma comment(lib,"windowscodecs.lib")
#pragma comment(lib,"ole32.lib")
#pragma comment(lib,"oleaut32.lib")
#include <vector>
#include <string>
#include <sstream>
#include "generated/AIQDocumentContract.h"
#include "SPBasic.h"
#include "SPInterf.h"
#include "SPSuites.h"

#include "AIScriptMessage.h"
#include "AIArt.h"
#include "AIDictionary.h"
#include "AIArtConverter.h"
#include "AITextFrame.h"
#include "AIMatchingArt.h"
#include "AIMdMemory.h"
#include "generated/AIQReadArt21.h"
#include "generated/AIQDict10.h"


#include "generated/AIQArtboardContract.h"
// Lifetime is explicitly owned by the acquired suite below.
ai::ArtboardProperties::ArtboardProperties():fImpl(nullptr){}
ai::ArtboardProperties::~ArtboardProperties(){}
ai::ArtboardList::ArtboardList():fImpl(nullptr){}
ai::ArtboardList::~ArtboardList(){}
namespace {
void trace(const char* a, const char* b = "") {
#ifdef AIQ_NATIVE_DIAGNOSTICS
    wchar_t path[MAX_PATH];
    if (!GetTempPathW(MAX_PATH, path)) return;
    wcscat_s(path, L"AIQNative-diagnostics.log");
    FILE* file = nullptr;
    if (_wfopen_s(&file, path, L"ab") == 0 && file) {
        std::fprintf(file, "%s | %s\n", a, b); std::fclose(file);
    }
#else
    (void)a; (void)b;
#endif
}
template<class T> class Suite {
    SPBasicSuite* basic;
    const char* name;
    ai::int32 version;
public:
    const T* value = nullptr;
    Suite(SPBasicSuite* b, const char* n, ai::int32 v):basic(b),name(n),version(v) {
        const void* acquired = nullptr;
        const SPErr error = basic->AcquireSuite(name, version, &acquired);
        if (error == kNoErr)
            value = static_cast<const T*>(acquired);
        char status[96];
        std::snprintf(status, sizeof(status), "version=%d error=%d %s", int(version), int(error), value ? "acquired" : "unavailable");
        trace(name, status);
    }
    ~Suite() { if (value) basic->ReleaseSuite(name, version); }
    Suite(const Suite&) = delete;
    Suite& operator=(const Suite&) = delete;
};

// A tiny one-shot IPC response, never an AI file or artwork copy. A strict nonce
// prevents arbitrary paths; CREATE_NEW prevents overwriting any existing file.
AIErr fileResponse(const char* nonce, const char* json) {
    if (std::strlen(nonce) != 32) return kCantHappenErr;
    for (const char* p = nonce; *p; ++p)
        if (!((*p >= '0' && *p <= '9') || (*p >= 'a' && *p <= 'f'))) return kCantHappenErr;
    wchar_t path[MAX_PATH];
    DWORD length = GetTempPathW(MAX_PATH, path);
    if (!length || length + 52 >= MAX_PATH) return kCantHappenErr;
    wchar_t suffix[64];
    swprintf_s(suffix, L"AIQNative-%hs.json", nonce);
    wcscat_s(path, suffix);
    HANDLE file = CreateFileW(path, GENERIC_WRITE, 0, nullptr, CREATE_NEW,
        FILE_ATTRIBUTE_TEMPORARY, nullptr);
    if (file == INVALID_HANDLE_VALUE) return kCantHappenErr;
    DWORD written = 0;
    const DWORD expected = static_cast<DWORD>(std::strlen(json));
    const bool ok = WriteFile(file, json, expected, &written, nullptr) && written == expected;
    CloseHandle(file);
    if (!ok) DeleteFileW(path);
    return ok ? kNoErr : kCantHappenErr;
}

#include "glyph-measure.h"
#include "rgb-jpeg.h"
#include "document-bleed-write.h"

AIErr readBleedToFile(SPBasicSuite* basic, const char* nonce) {
    Suite<AIQDocumentSuite21> documents(basic, "AI Document Suite", 21);
    if (!documents.value)
        return fileResponse(nonce, "{\"ok\":false,\"error\":\"DOCUMENT_SUITE_UNAVAILABLE\"}");
    void* document = nullptr;
    if (documents.value->GetDocument(&document) != kNoErr || !document)
        return fileResponse(nonce, "{\"ok\":false,\"error\":\"NO_DOCUMENT\"}");
    AIQRealRect bleed = {};
    if (documents.value->GetDocumentBleeds(&bleed) != kNoErr)
        return fileResponse(nonce, "{\"ok\":false,\"error\":\"BLEED_READ_FAILED\"}");
    const double sides[] = {bleed.left, bleed.top, bleed.right, bleed.bottom};
    for (double value : sides) if (!std::isfinite(value) || value < 0)
        return fileResponse(nonce, "{\"ok\":false,\"error\":\"INVALID_BLEED\"}");
    char json[256];
    std::snprintf(json, sizeof(json), "{\"ok\":true,\"protocol\":1,\"unit\":\"pt\",\"offsets\":[%.12g,%.12g,%.12g,%.12g]}",
        sides[0], sides[1], sides[2], sides[3]);
    return fileResponse(nonce, json);
}

AIErr readBoardSelection(SPBasicSuite* basic,const char* nonce){
 Suite<AIQArtboardSuite4> boards(basic,"AI Artboard Suite",4);
 if(!boards.value)return fileResponse(nonce,"{\"ok\":false,\"error\":\"ARTBOARD_SUITE_UNAVAILABLE\"}");
 ai::ArtboardList list;
 if(boards.value->GetArtboardList(list)!=kNoErr)return fileResponse(nonce,"{\"ok\":false,\"error\":\"NO_ARTBOARDS\"}");
 ai::ArtboardID count=0,active=0;std::vector<int> selected;bool ok=boards.value->GetCount(list,count)==kNoErr&&count>0&&count<=1000&&boards.value->GetActive(list,active)==kNoErr;
 for(int i=0;ok&&i<count;++i){ai::ArtboardProperties properties;
  if(boards.value->Init(properties)!=kNoErr){ok=false;break;}
  AIBoolean flag=false;ok=boards.value->GetArtboardProperties(list,i,properties)==kNoErr&&boards.value->IsSelected(properties,flag)==kNoErr;
  if(ok&&flag)selected.push_back(i);
  if(boards.value->Dispose(properties)!=kNoErr)ok=false;
 }
 if(boards.value->ReleaseArtboardList(list)!=kNoErr)ok=false;
 if(!ok)return fileResponse(nonce,"{\"ok\":false,\"error\":\"ARTBOARD_READ_FAILED\"}");
 std::ostringstream json;json<<"{\"ok\":true,\"protocol\":1,\"count\":"<<count<<",\"active\":"<<active<<",\"selected\":[";
 for(size_t i=0;i<selected.size();++i){if(i)json<<',';json<<selected[i];}json<<"]}";
 return fileResponse(nonce,json.str().c_str());
}

AIErr readMessage(const char* selector, AIScriptMessage* message) {
    if(std::strncmp(selector,"bleed-set:",10)==0)return writeDocumentBleed(message->d.basic,selector+10);
    if(std::strncmp(selector,"boards-file:",12)==0)return readBoardSelection(message->d.basic,selector+12);
    if (std::strncmp(selector, "jpeg-file:", 10) == 0)
        return encodeRGBJPEGToFile(selector + 10);
    if (std::strncmp(selector, "glyph-file:", 11) == 0)
        return measureGlyphsToFile(message->d.basic, selector + 11);
    if (std::strncmp(selector, "bleed-file:", 11) == 0)
        return readBleedToFile(message->d.basic, selector + 11);
    if (std::strncmp(selector, "ping-file:", 10) == 0)
        return fileResponse(selector + 10, "{\"ok\":true,\"protocol\":1,\"version\":\"0.5.0\",\"readOnly\":false,\"bleedWrite\":true,\"glyphBounds\":true,\"rgbJPEG\":true}");
#ifdef AIQ_NATIVE_DIAGNOSTICS
    if (std::strcmp(selector, "suite-catalog") == 0) {
        Suite<SPSuitesSuite> suites(message->d.basic, kSPSuitesSuite, kSPSuitesSuiteVersion);
        if (!suites.value) return kCantHappenErr;
        SPSuiteListIteratorRef iter = nullptr;
        AIErr error = suites.value->NewSuiteListIterator(nullptr, &iter);
        if (error || !iter) return kCantHappenErr;
        SPSuiteRef suite = nullptr;
        for (int count = 0; count < 10000 && suites.value->NextSuite(iter, &suite) == kNoErr && suite; ++count) {
            const char* name = nullptr; ai::int32 version = 0;
            if (suites.value->GetSuiteName(suite, &name) == kNoErr && name &&
                (std::strstr(name, "Unicode") || std::strstr(name, "Document"))) {
                suites.value->GetSuiteAPIVersion(suite, &version);
                char value[32]; std::snprintf(value, sizeof(value), "version=%d", int(version));
                trace(name, value);
            }
        }
        suites.value->DeleteSuiteListIterator(iter);
        return kNoErr;
    }
#endif
    return kCantHappenErr;
}
}

extern "C" __declspec(dllexport) ASAPI ASErr PluginMain(char* caller, char* selector, void* rawMessage) {
    trace(caller ? caller : "null caller", selector ? selector : "null selector");
    if (!caller || !selector || !rawMessage) return kCantHappenErr;
    const auto* data = static_cast<SPMessageData*>(rawMessage);
    if (!data->basic) return kCantHappenErr;
    try {
        if (std::strcmp(caller, kCallerAIScriptMessage) == 0)
            return readMessage(selector, static_cast<AIScriptMessage*>(rawMessage));
        // No persistent suites or objects survive a call, so startup/unload need no cleanup.
        return kNoErr;
    } catch (...) { return kCantHappenErr; }
}
