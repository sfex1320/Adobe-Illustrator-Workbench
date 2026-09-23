#include <windows.h>
#include <wincodec.h>
#include <wrl/client.h>
#include <bcrypt.h>
#include <cstdio>
#include <vector>
#include <string>
#include <stdexcept>
#include <cmath>
#pragma comment(lib,"ole32.lib")
#pragma comment(lib,"windowscodecs.lib")
#pragma comment(lib,"bcrypt.lib")
using Microsoft::WRL::ComPtr;
static void ok(HRESULT hr){if(FAILED(hr))throw std::runtime_error("codec HRESULT "+std::to_string(static_cast<unsigned long>(hr)));}
static void profile(IWICBitmapFrameDecode* f,IWICBitmapFrameEncode* e){UINT n=0;ok(f->GetColorContexts(0,nullptr,&n));if(n!=1)throw std::runtime_error("Expected one embedded ICC profile");ComPtr<IWICImagingFactory> fac;ok(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&fac)));ComPtr<IWICColorContext> c;ok(fac->CreateColorContext(&c));auto p=c.Get();ok(f->GetColorContexts(1,&p,&n));ok(e->SetColorContexts(1,&p));}
int wmain(int argc,wchar_t** argv){
 try{
  if(argc!=10)throw std::runtime_error("input output format color ppi quality width height");
  ok(CoInitializeEx(nullptr,COINIT_MULTITHREADED));
  const std::wstring kind=argv[3],color=argv[4];double dpi=std::stod(argv[5]),q=std::stod(argv[6]);UINT ew=std::stoul(argv[7]),eh=std::stoul(argv[8]);
  if((kind!=L"jpeg"&&kind!=L"png"&&kind!=L"tif"&&kind!=L"verify")||(color!=L"rgb"&&color!=L"cmyk")||!std::isfinite(dpi)||dpi<1||dpi>2400||!std::isfinite(q)||q<0||q>100||ew==0||eh==0||ew>65000||eh>65000||uint64_t(ew)*eh>1000000000ULL)throw std::runtime_error("invalid codec plan");
  ComPtr<IWICImagingFactory> fac;ok(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&fac)));
  ComPtr<IWICBitmapDecoder> dec;ok(fac->CreateDecoderFromFilename(argv[1],nullptr,GENERIC_READ,WICDecodeMetadataCacheOnDemand,&dec));UINT count=0;ok(dec->GetFrameCount(&count));if(count!=1)throw std::runtime_error("Expected one frame");ComPtr<IWICBitmapFrameDecode> f;ok(dec->GetFrame(0,&f));UINT w=0,h=0;ok(f->GetSize(&w,&h));if(w!=ew||h!=eh)throw std::runtime_error("pixel dimensions mismatch");
  WICPixelFormatGUID src;ok(f->GetPixelFormat(&src));bool cmyk=color==L"cmyk",alpha=(kind==L"png"||kind==L"verify")&&(src==GUID_WICPixelFormat32bppBGRA||src==GUID_WICPixelFormat32bppRGBA);
  if(cmyk&&src!=GUID_WICPixelFormat32bppCMYK)throw std::runtime_error("CMYK channels lost");
  if(!cmyk&&src==GUID_WICPixelFormat32bppCMYK)throw std::runtime_error("Unexpected CMYK channels");
  GUID fmt=cmyk?GUID_WICPixelFormat32bppCMYK:alpha?GUID_WICPixelFormat32bppBGRA:GUID_WICPixelFormat24bppBGR;
  ComPtr<IWICFormatConverter> pixels;ok(fac->CreateFormatConverter(&pixels));ok(pixels->Initialize(f.Get(),fmt,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom));
  const UINT stride=w*(cmyk||alpha?4:3),rows=64;std::vector<BYTE> data(static_cast<size_t>(stride)*rows);
  if(kind==L"verify"){
   BCRYPT_ALG_HANDLE alg=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;if(BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0)throw std::runtime_error("hash init");if(BCryptCreateHash(alg,&hash,nullptr,0,nullptr,0,0)<0)throw std::runtime_error("hash create");
   for(UINT y=0;y<h;y+=rows){UINT n=(std::min)(rows,h-y);WICRect r={0,static_cast<INT>(y),static_cast<INT>(w),static_cast<INT>(n)};ok(pixels->CopyPixels(&r,stride,stride*n,data.data()));if(BCryptHashData(hash,data.data(),stride*n,0)<0)throw std::runtime_error("hash pixels");}
   BYTE digest[32];if(BCryptFinishHash(hash,digest,32,0)<0)throw std::runtime_error("hash finish");BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(alg,0);
   for(BYTE b:digest)printf("%02x",b);puts("");return 0;
  }
  if(kind==L"png"&&cmyk)throw std::runtime_error("PNG cannot contain CMYK");
  HANDLE owned=CreateFileW(argv[2],GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);if(owned==INVALID_HANDLE_VALUE)throw std::runtime_error("output exists or inaccessible");CloseHandle(owned);
  try{
   ComPtr<IWICStream> stream;ok(fac->CreateStream(&stream));ok(stream->InitializeFromFilename(argv[2],GENERIC_WRITE));ComPtr<IWICBitmapEncoder> enc;ok(fac->CreateEncoder(kind==L"jpeg"?GUID_ContainerFormatJpeg:kind==L"png"?GUID_ContainerFormatPng:GUID_ContainerFormatTiff,nullptr,&enc));ok(enc->Initialize(stream.Get(),WICBitmapEncoderNoCache));ComPtr<IWICBitmapFrameEncode> frame;ComPtr<IPropertyBag2> props;ok(enc->CreateNewFrame(&frame,&props));
   if(kind==L"jpeg"){PROPBAG2 p={};p.pstrName=const_cast<wchar_t*>(L"ImageQuality");VARIANT v={};v.vt=VT_R4;v.fltVal=float(q/100);ok(props->Write(1,&p,&v));p.pstrName=const_cast<wchar_t*>(L"JpegYCrCbSubsampling");v.vt=VT_UI1;v.bVal=WICJpegYCrCbSubsampling444;ok(props->Write(1,&p,&v));}
   if(kind==L"tif"){PROPBAG2 p={};p.pstrName=const_cast<wchar_t*>(L"TiffCompressionMethod");VARIANT v={};v.vt=VT_UI1;v.bVal=WICTiffCompressionLZW;ok(props->Write(1,&p,&v));}
   ok(frame->Initialize(props.Get()));ok(frame->SetSize(w,h));ok(frame->SetResolution(dpi,dpi));GUID selected=fmt;ok(frame->SetPixelFormat(&selected));if(selected!=fmt)throw std::runtime_error("encoder changed color channels");ComPtr<IWICColorContext> outputProfile;ok(fac->CreateColorContext(&outputProfile));ok(outputProfile->InitializeFromFilename(argv[9]));auto context=outputProfile.Get();ok(frame->SetColorContexts(1,&context));
   for(UINT y=0;y<h;y+=rows){UINT n=(std::min)(rows,h-y);WICRect r={0,static_cast<INT>(y),static_cast<INT>(w),static_cast<INT>(n)};ok(pixels->CopyPixels(&r,stride,stride*n,data.data()));ok(frame->WritePixels(n,stride,stride*n,data.data()));}
   ok(frame->Commit());ok(enc->Commit());
  }catch(...){DeleteFileW(argv[2]);throw;}
  return 0;
 }catch(const std::exception& e){fprintf(stderr,"%s\n",e.what());return 1;}
}
