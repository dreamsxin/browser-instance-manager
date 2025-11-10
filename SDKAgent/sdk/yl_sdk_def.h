#ifndef YUN_LOGIN_SDK_DEF_H_
#define YUN_LOGIN_SDK_DEF_H_

#if defined(WIN32)
# if defined(YL_SDK_DLL_EXPORT)
#  define YL_SDK_API __declspec(dllexport)
# else
#  define YL_SDK_API __declspec(dllimport)  
# endif
#else
# if defined(YL_SDK_DLL_EXPORT)
#  define YL_SDK_API __attribute__((visibility("default")))
# else
#  define YL_SDK_API
# endif
#endif 

#define YL_SDK_NAMESPACE YLSDK
#define BEGIN_YL_SDK_NAMESPACE namespace YL_SDK_NAMESPACE {
#define END_YL_SDK_NAMESPACE };
#define USING_YL_SDK_NAMESPACE using namespace YL_SDK_NAMESPACE;

BEGIN_YL_SDK_NAMESPACE

enum SDKError
{
	SDKERR_SUCCESS = 0,///<Success.
	SDKERR_NO_IMPL,///<This feature is currently invalid. 
	SDKERR_INVALID_PARAMETER,///<Wrong parameter.
	SDKERR_UNINITIALIZE,///<Not initialized before the usage.
	SDKERR_UNKNOWN,///<Unknown error.
};

/*! \struct tagInitParam
    \brief Initialize the SDK Parameter.
*/
typedef struct tagInitParam  
{
	const wchar_t* companyName;
	const wchar_t* brandingName; ///< brandingName. 必需：是，英文字母或加数字，最好不要有空格：如UshopBrowser.
	const wchar_t* appId; ///< appId. 必需：是 
	const wchar_t* appSecret; ///< appSecret.必需：是 

	const wchar_t* appIcon; ///< 应用图标本地文件全路径. 如未指定，默认为SDK所在目录 app_icon_48x48.png
	const wchar_t* browserCoresDir; ///< 浏览器内核所在路径. 如未指定，默认为SDK所在目录
	const wchar_t* cacheDir; ///< 浏览器沙盒缓存路径. 如未指定，默认为C:\\Users\\[User Name]\\AppData\\Local\\[brandingName]

	const wchar_t* google_api_key;
	const wchar_t* google_default_client_id;
	const wchar_t* google_default_client_secret;

	const wchar_t* browserEventNotifyUrl;

	tagInitParam()
	{
		companyName = nullptr;
		brandingName = nullptr;
		appIcon = nullptr;
		appId = nullptr;
		appSecret = nullptr;
		browserCoresDir = nullptr;
		cacheDir = nullptr;

		google_api_key = nullptr;
		google_default_client_id = nullptr;
		google_default_client_secret = nullptr;

		browserEventNotifyUrl = nullptr;
	}
} InitParam;

typedef struct tagSDKInfo  
{
	int port; 
	const char* sdkVersion;
	const char* versionCode;
	const char* platform;
	const char* bitness;

	tagSDKInfo()
	{
		port = 0;
		sdkVersion = nullptr;
		versionCode = nullptr;
		platform = nullptr;
		bitness = nullptr;
	}
} SDKInfo;

END_YL_SDK_NAMESPACE

#endif//YUN_LOGIN_SDK_DEF_H_