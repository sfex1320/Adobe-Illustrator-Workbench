// Included inside the native bridge namespace after Suite and fileResponse.
// All temporary art lives in an unattached dictionary, never the document tree.
struct GlyphTarget { int story; int frame; AIArtHandle art = nullptr; };

bool readGlyphInteger(const char*& p, int& value) {
    if (*p < '0' || *p > '9') return false;
    value = 0;
    do { value = value * 10 + (*p++ - '0'); if (value > 1000000) return false; }
    while (*p >= '0' && *p <= '9');
    return true;
}

AIErr measureGlyphsToFile(SPBasicSuite* basic, const char* request) {
    if (std::strlen(request) < 36 || std::strlen(request)>4096 || request[32] != ':') return kCantHappenErr;
    char nonce[33] = {}; std::memcpy(nonce, request, 32);
    for (const char c : nonce) if (c && !((c >= 'a' && c <= 'f') || (c >= '0' && c <= '9'))) return kCantHappenErr;
    auto fail = [&](const char* code) { std::string json = "{\"ok\":false,\"error\":\""; json += code; json += "\"}"; return fileResponse(nonce,json.c_str()); };
    std::vector<GlyphTarget> targets;
    const char* p = request + 33;
    while (*p) {
        GlyphTarget t;
        if (targets.size() >= 100 || !readGlyphInteger(p,t.story) || *p++ != ',' || !readGlyphInteger(p,t.frame)) return fail("INVALID_TARGETS");
        for (const auto& old : targets) if (old.story == t.story && old.frame == t.frame) return fail("DUPLICATE_TARGET");
        targets.push_back(t);
        if (*p && *p++ != ';') return fail("INVALID_TARGETS");
    }
    if (targets.empty()) return fail("EMPTY_TARGETS");
    Suite<AIQReadArt21> art(basic,kAIArtSuite,21);
    Suite<AIQDict10> dict(basic,kAIDictionarySuite,10);
    Suite<AIArtConverterSuite> converter(basic,kAIArtConverterSuite,kAIArtConverterSuiteVersion);
    Suite<AITextFrameSuite> text(basic,kAITextFrameSuite,kAITextFrameSuiteVersion);
    Suite<AIMatchingArtSuite> matching(basic,kAIMatchingArtSuite,kAIMatchingArtSuiteVersion);
    Suite<AIMdMemorySuite> memory(basic,kAIMdMemorySuite,kAIMdMemorySuiteVersion);
    Suite<AIQDocumentSuite21> document(basic,"AI Document Suite",21);
    if (!art.value || !dict.value || !converter.value || !text.value || !matching.value || !memory.value || !document.value) return fail("GLYPH_SUITE_UNAVAILABLE");
    void* originalDocument = nullptr;
    if (document.value->GetDocument(&originalDocument) || !originalDocument) return fail("NO_DOCUMENT");
    struct MatchOwner {
        AIArtHandle** handles = nullptr; const AIMdMemorySuite* memory;
        ~MatchOwner(){ if(handles) memory->MdMemoryDisposeHandle(reinterpret_cast<AIMdMemoryHandle>(handles)); }
    } matches{nullptr,memory.value};
    AIMatchingArtSpec spec = {kTextFrameArt,0,0}; ai::int32 count = 0;
    if (matching.value->GetMatchingArt(&spec,1,&matches.handles,&count) || count < 0 || count > 1000000 || (count>0&&!matches.handles)) return fail("TEXT_QUERY_FAILED");
    for (int i=0;i<count;i++) {
        ai::int32 story=-1,frame=-1; AIArtHandle candidate=(*matches.handles)[i];
        if (text.value->GetStoryIndex(candidate,&story) || text.value->GetFrameIndex(candidate,&frame)) continue;
        for (auto& t:targets) if(t.story==story && t.frame==frame) {
            if(t.art && t.art!=candidate) return fail("AMBIGUOUS_TARGET"); t.art=candidate;
        }
    }
    for(const auto& t:targets) if(!t.art) return fail("STALE_TARGET");
    std::ostringstream json; json.precision(14);
    json << "{\"ok\":true,\"protocol\":1,\"unit\":\"pt\",\"method\":\"dictionary-outline\",\"items\":[";
    for(size_t i=0;i<targets.size();i++) {
        const auto& t=targets[i];
        struct DictOwner { AIDictionaryRef ref=nullptr; const AIQDict10* suite; ~DictOwner(){if(ref)suite->Release(ref);} } owner{nullptr,dict.value};
        if(dict.value->CreateDictionary(&owner.ref) || !owner.ref) return fail("GLYPH_MEMORY_FAILED");
        const auto key=dict.value->Key("AIQ_transient_glyph_container"); AIArtHandle container=nullptr,outline=nullptr;
        if(dict.value->NewArtEntry(owner.ref,key,kGroupArt) || dict.value->GetArtEntry(owner.ref,key,&container) || !container) return fail("GLYPH_CONTAINER_FAILED");
        AIRealRect sourceBounds={},glyphBounds={};
        if(art.value->GetArtTransformBounds(t.art,nullptr,0,&sourceBounds)) return fail("SOURCE_BOUNDS_FAILED");
        if(converter.value->GetOutlineArt(t.art,kPlaceInsideOnTop,container,kOutlineExpandAppearance|kOutlineAddStrokes|kOutlineAlwaysIncludeFillArea,&outline) || !outline) return fail("GLYPH_OUTLINE_FAILED");
        const AIErr boundsError=art.value->GetArtTransformBounds(outline,nullptr,0,&glyphBounds);
        const AIErr disposeError=art.value->DisposeArt(outline);
        if(boundsError || disposeError) return fail("GLYPH_BOUNDS_FAILED");
        auto writeBounds=[&](const AIRealRect& b){json<<'['<<b.left<<','<<b.top<<','<<b.right<<','<<b.bottom<<']';};
        const double values[]={sourceBounds.left,sourceBounds.top,sourceBounds.right,sourceBounds.bottom,glyphBounds.left,glyphBounds.top,glyphBounds.right,glyphBounds.bottom};
        for(double value:values) if(!std::isfinite(value)) return fail("INVALID_BOUNDS");
        if(i)json<<',';
        json<<"{\"story\":"<<t.story<<",\"frame\":"<<t.frame<<",\"sourceBounds\":";writeBounds(sourceBounds);json<<",\"bounds\":";writeBounds(glyphBounds);json<<'}';
    }
    void* currentDocument=nullptr;
    if(document.value->GetDocument(&currentDocument) || currentDocument!=originalDocument) return fail("DOCUMENT_CHANGED");
    json<<"]}";
    return fileResponse(nonce,json.str().c_str());
}
