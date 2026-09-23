// Encode already-rendered opaque RGB pixels. No Illustrator document suites,
// action palette, art handles or undo APIs are used by this path.
HRESULT encodeRGBJPEG(const wchar_t* input, const wchar_t* output, double quality) {
    using Microsoft::WRL::ComPtr;
    struct COMScope { HRESULT hr=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED); ~COMScope(){if(SUCCEEDED(hr))CoUninitialize();} } com;
    if(FAILED(com.hr)&&com.hr!=RPC_E_CHANGED_MODE)return com.hr;
    const DWORD attrs=GetFileAttributesW(input);
    if(attrs==INVALID_FILE_ATTRIBUTES||(attrs&(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT)))return E_INVALIDARG;
    ComPtr<IWICImagingFactory> factory;
    HRESULT hr=CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory));
    if(FAILED(hr))return hr;
    ComPtr<IWICBitmapDecoder> decoder;
    if(FAILED(hr=factory->CreateDecoderFromFilename(input,nullptr,GENERIC_READ,WICDecodeMetadataCacheOnDemand,&decoder)))return hr;
    GUID container={};UINT frames=0;
    if(FAILED(hr=decoder->GetContainerFormat(&container))||container!=GUID_ContainerFormatPng)return E_INVALIDARG;
    if(FAILED(hr=decoder->GetFrameCount(&frames))||frames!=1)return E_INVALIDARG;
    ComPtr<IWICBitmapFrameDecode> frame;UINT width=0,height=0;
    if(FAILED(hr=decoder->GetFrame(0,&frame))||FAILED(hr=frame->GetSize(&width,&height)))return hr;
    if(!width||!height||width>30000||height>30000||static_cast<unsigned long long>(width)*height>100000000)return E_INVALIDARG;
    ComPtr<IWICFormatConverter> pixels;
    if(FAILED(hr=factory->CreateFormatConverter(&pixels)))return hr;
    if(FAILED(hr=pixels->Initialize(frame.Get(),GUID_WICPixelFormat24bppBGR,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom)))return hr;
    ComPtr<IStream> memory;
    if(FAILED(hr=CreateStreamOnHGlobal(nullptr,TRUE,&memory)))return hr;
    ComPtr<IWICBitmapEncoder> encoder;
    if(FAILED(hr=factory->CreateEncoder(GUID_ContainerFormatJpeg,nullptr,&encoder))||FAILED(hr=encoder->Initialize(memory.Get(),WICBitmapEncoderNoCache)))return hr;
    ComPtr<IWICBitmapFrameEncode> encoded;ComPtr<IPropertyBag2> options;
    if(FAILED(hr=encoder->CreateNewFrame(&encoded,&options)))return hr;
    PROPBAG2 prop={};prop.pstrName=const_cast<LPOLESTR>(L"ImageQuality");VARIANT value={};value.vt=VT_R4;value.fltVal=static_cast<float>(quality/100.0);
    if(FAILED(hr=options->Write(1,&prop,&value))||FAILED(hr=encoded->Initialize(options.Get()))||FAILED(hr=encoded->SetSize(width,height))||FAILED(hr=encoded->SetResolution(72,72)))return hr;
    GUID format=GUID_WICPixelFormat24bppBGR;
    if(FAILED(hr=encoded->SetPixelFormat(&format))||format!=GUID_WICPixelFormat24bppBGR)return E_FAIL;
    UINT contexts=0;hr=frame->GetColorContexts(0,nullptr,&contexts);
    if(SUCCEEDED(hr)&&contexts){
        if(contexts!=1)return E_INVALIDARG;
        ComPtr<IWICColorContext> profile;if(FAILED(hr=factory->CreateColorContext(&profile)))return hr;
        IWICColorContext* ptr=profile.Get();
        if(FAILED(hr=frame->GetColorContexts(1,&ptr,&contexts))||FAILED(hr=encoded->SetColorContexts(1,&ptr)))return hr;
    }
    if(FAILED(hr=encoded->WriteSource(pixels.Get(),nullptr))||FAILED(hr=encoded->Commit())||FAILED(hr=encoder->Commit()))return hr;
    STATSTG stat={};if(FAILED(hr=memory->Stat(&stat,STATFLAG_NONAME))||!stat.cbSize.QuadPart||stat.cbSize.QuadPart>512ULL*1024*1024)return E_FAIL;
    LARGE_INTEGER zero={};if(FAILED(hr=memory->Seek(zero,STREAM_SEEK_SET,nullptr)))return hr;
    HANDLE file=CreateFileW(output,GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_TEMPORARY,nullptr);
    if(file==INVALID_HANDLE_VALUE)return HRESULT_FROM_WIN32(GetLastError());
    unsigned char buffer[65536];unsigned long long remaining=stat.cbSize.QuadPart;bool complete=false;
    while(remaining){ULONG got=0;DWORD written=0;const ULONG requested=static_cast<ULONG>((std::min)(remaining,static_cast<unsigned long long>(sizeof(buffer))));
        if(FAILED(hr=memory->Read(buffer,requested,&got))||got!=requested){hr=E_FAIL;break;}
        if(!WriteFile(file,buffer,got,&written,nullptr)||written!=got){hr=E_FAIL;break;}remaining-=got;
    }
    complete=remaining==0;CloseHandle(file);if(!complete)DeleteFileW(output);
    return complete?S_OK:hr;
}
AIErr encodeRGBJPEGToFile(const char* request) {
    const std::string args(request);if(args.size()<34||args.size()>48||args[32]!=':')return kCantHappenErr;
    const std::string nonce=args.substr(0,32);for(char c:nonce)if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return kCantHappenErr;
    char* end=nullptr;const double quality=std::strtod(args.c_str()+33,&end);
    if(!end||*end||!std::isfinite(quality)||quality<0||quality>100)return kCantHappenErr;
    wchar_t temp[MAX_PATH];const DWORD n=GetTempPathW(MAX_PATH,temp);if(!n||n+60>=MAX_PATH)return kCantHappenErr;
    wchar_t input[MAX_PATH],output[MAX_PATH];swprintf_s(input,L"%lsAIQJPEG-%hs.png",temp,nonce.c_str());swprintf_s(output,L"%lsAIQJPEG-%hs.jpg",temp,nonce.c_str());
    const HRESULT hr=encodeRGBJPEG(input,output,quality);char json[160];
    if(SUCCEEDED(hr))std::snprintf(json,sizeof(json),"{\"ok\":true,\"protocol\":1,\"color\":\"rgb\"}");
    else std::snprintf(json,sizeof(json),"{\"ok\":false,\"error\":\"RGB_JPEG_ENCODING_FAILED\",\"code\":\"%08lx\"}",static_cast<unsigned long>(hr));
    return fileResponse(nonce.c_str(),json);
}
