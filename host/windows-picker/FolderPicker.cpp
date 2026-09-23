#include <windows.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <shellapi.h>
#include <wrl/client.h>
#include <string>
#pragma comment(lib,"ole32.lib")
#pragma comment(lib,"shell32.lib")
using Microsoft::WRL::ComPtr;
static std::string jsonString(const wchar_t* text){std::string out="\"";for(auto p=text;*p;++p){char escaped[7];sprintf_s(escaped,"\\u%04x",unsigned(*p));out+=escaped;}return out+'"';}
static bool respond(const wchar_t* nonce,const std::string& value){
 if(wcslen(nonce)!=32)return false;for(auto p=nonce;*p;++p)if(!(*p>=L'0'&&*p<=L'9')&&!(*p>=L'a'&&*p<=L'f'))return false;
 PWSTR appData=nullptr;if(FAILED(SHGetKnownFolderPath(FOLDERID_RoamingAppData,0,nullptr,&appData)))return false;
 std::wstring root=std::wstring(appData)+L"\\AIQ-Workbench";CoTaskMemFree(appData);
 if(!CreateDirectoryW(root.c_str(),nullptr)&&GetLastError()!=ERROR_ALREADY_EXISTS)return false;
 const auto file=root+L"\\folder-"+nonce+L".json";
 HANDLE h=CreateFileW(file.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);if(h==INVALID_HANDLE_VALUE)return false;
 DWORD wrote=0;bool ok=WriteFile(h,value.data(),DWORD(value.size()),&wrote,nullptr)&&wrote==value.size();CloseHandle(h);return ok;
}
int WINAPI wWinMain(HINSTANCE,HINSTANCE,PWSTR,int){
 SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
 int count=0;auto args=CommandLineToArgvW(GetCommandLineW(),&count);if(!args||count<2){if(args)LocalFree(args);return 2;}
 std::wstring nonce=args[1],initial=count>2?args[2]:L"";LocalFree(args);
 if(nonce.size()!=32||nonce.find_first_not_of(L"0123456789abcdef")!=std::wstring::npos)return 2;
 const HRESULT init=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED|COINIT_DISABLE_OLE1DDE);
 if(FAILED(init)){respond(nonce.c_str(),"{\"ok\":false,\"error\":\"COM_INIT\"}");return 3;}
 HRESULT hr;std::string result="{\"ok\":false,\"error\":\"FOLDER_DIALOG\"}";
 {
  ComPtr<IFileOpenDialog> dialog;hr=CoCreateInstance(CLSID_FileOpenDialog,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&dialog));
  if(SUCCEEDED(hr)){
   DWORD flags=0;hr=dialog->GetOptions(&flags);if(SUCCEEDED(hr))hr=dialog->SetOptions(flags|FOS_PICKFOLDERS|FOS_FORCEFILESYSTEM|FOS_PATHMUSTEXIST|FOS_NOCHANGEDIR);
   if(SUCCEEDED(hr))hr=dialog->SetTitle(L"选择文件夹");
   if(SUCCEEDED(hr))hr=dialog->SetOkButtonLabel(L"选择文件夹");
   if(!initial.empty()){ComPtr<IShellItem> folder;if(SUCCEEDED(SHCreateItemFromParsingName(initial.c_str(),nullptr,IID_PPV_ARGS(&folder))))dialog->SetFolder(folder.Get());}
   if(SUCCEEDED(hr))hr=dialog->Show(nullptr);
   if(hr==HRESULT_FROM_WIN32(ERROR_CANCELLED))result="{\"ok\":true,\"folder\":null}";
   else if(SUCCEEDED(hr)){ComPtr<IShellItem> item;PWSTR path=nullptr;if(SUCCEEDED(dialog->GetResult(&item))&&SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH,&path))){result="{\"ok\":true,\"folder\":"+jsonString(path)+"}";CoTaskMemFree(path);}}
  }
 }
 CoUninitialize();return respond(nonce.c_str(),result)?0:4;
}
