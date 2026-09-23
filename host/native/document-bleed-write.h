// Explicit document-setting write. No saves, document copies, artwork edits or selection changes.
// Reserve the reply before mutation: duplicate requests and unwritable temp storage
// must never change document settings while appearing to have failed to start.
class BleedWriteReply {
    HANDLE file=INVALID_HANDLE_VALUE;wchar_t path[MAX_PATH]={};bool completed=false;
public:
    explicit BleedWriteReply(const char* nonce){
        DWORD length=GetTempPathW(MAX_PATH,path);if(!length||length+52>=MAX_PATH)return;
        wchar_t suffix[64];swprintf_s(suffix,L"AIQNative-%hs.json",nonce);wcscat_s(path,suffix);
        file=CreateFileW(path,GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_TEMPORARY,nullptr);
    }
    bool valid() const{return file!=INVALID_HANDLE_VALUE;}
    AIErr send(const char* json){DWORD written=0,size=static_cast<DWORD>(std::strlen(json));completed=WriteFile(file,json,size,&written,nullptr)&&written==size;return completed?kNoErr:kCantHappenErr;}
    ~BleedWriteReply(){if(valid()){CloseHandle(file);if(!completed)DeleteFileW(path);}}
};
AIErr writeDocumentBleed(SPBasicSuite* basic,const char* request) {
    // nonce:left,top,right,bottom; every byte is validated before acquiring a suite.
    if(std::strlen(request)>160 || std::strlen(request)<40 || request[32]!=':')return kCantHappenErr;
    char nonce[33]={};std::memcpy(nonce,request,32);
    for(int i=0;i<32;i++)if(!((nonce[i]>='0'&&nonce[i]<='9')||(nonce[i]>='a'&&nonce[i]<='f')))return kCantHappenErr;
    AIQRealRect next={};double* values[]={&next.left,&next.top,&next.right,&next.bottom};const char* cursor=request+33;
    for(int i=0;i<4;i++){
        const char* start=cursor;while((*cursor>='0'&&*cursor<='9')||*cursor=='.')++cursor;
        if(cursor==start || (i<3?*cursor!=',':*cursor!='\0'))return fileResponse(nonce,"{\"ok\":false,\"error\":\"INVALID_BLEED\"}");
        char* end=nullptr;*values[i]=std::strtod(start,&end);
        if(end!=cursor||!std::isfinite(*values[i])||*values[i]<0||*values[i]>72)return fileResponse(nonce,"{\"ok\":false,\"error\":\"INVALID_BLEED\"}");
        if(i<3)++cursor;
    }
    Suite<AIQDocumentSuite21> documents(basic,"AI Document Suite",21);
    void* document=nullptr;
    if(!documents.value||documents.value->GetDocument(&document)!=kNoErr||!document)return fileResponse(nonce,"{\"ok\":false,\"error\":\"NO_DOCUMENT\"}");
    AIQRealRect before={};if(documents.value->GetDocumentBleeds(&before)!=kNoErr)return fileResponse(nonce,"{\"ok\":false,\"error\":\"BLEED_READ_FAILED\"}");
    const bool changed=before.left!=next.left||before.top!=next.top||before.right!=next.right||before.bottom!=next.bottom;
    BleedWriteReply reply(nonce);if(!reply.valid())return kCantHappenErr;
    if(changed&&documents.value->SetDocumentBleeds(next)!=kNoErr)return reply.send("{\"ok\":false,\"error\":\"BLEED_WRITE_FAILED\"}");
    AIQRealRect actual={};
    if(documents.value->GetDocumentBleeds(&actual)!=kNoErr||std::abs(actual.left-next.left)>0.00001||std::abs(actual.top-next.top)>0.00001||std::abs(actual.right-next.right)>0.00001||std::abs(actual.bottom-next.bottom)>0.00001)
        return reply.send("{\"ok\":false,\"error\":\"BLEED_VERIFY_FAILED\"}");
    char json[256];std::snprintf(json,sizeof(json),"{\"ok\":true,\"protocol\":1,\"unit\":\"pt\",\"changed\":%s,\"offsets\":[%.12g,%.12g,%.12g,%.12g]}",changed?"true":"false",actual.left,actual.top,actual.right,actual.bottom);
    return reply.send(json);
}
