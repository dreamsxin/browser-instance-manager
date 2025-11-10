
#ifndef YUN_LOGIN_SDK_H_
#define YUN_LOGIN_SDK_H_

#include "yl_sdk_def.h"

BEGIN_YL_SDK_NAMESPACE

class BrowserEventDelegate {
public:
    virtual ~BrowserEventDelegate() {}
    virtual void OnBrowserOpening(const char* envId, const char* customData, int process) = 0;
    virtual void OnBrowserOpenResult(const char* envId, const char* customData, int code, const char* errMsg, const char* remoteDebuggingInfo) = 0;
	virtual void OnBrowserClosed(const char* envId, const char* customData) = 0;
    virtual void OnBrowserCookiesExported(const char* envId, const char* customData,const char* cookies) = 0;
};

/// 获取所有已启动的环境列表回调，envIds环境id逗号隔开
typedef int (*QueryAllLaunchedBrowserCallback)(const char* envIds);

extern "C"
{

/// 初始化SDK.
YL_SDK_API SDKError InitSDK(InitParam& initParam, BrowserEventDelegate* delegate = nullptr);

/// 获取SDK信息
YL_SDK_API SDKError GetSDKInfo(SDKInfo& info);

/// 清理SDK.
YL_SDK_API SDKError CleanUPSDK();

/// 获取SDK版本号.
YL_SDK_API const char* GetSDKVersion();

/// 启动浏览器 json字符串
YL_SDK_API bool StartBrowser(const char* envId, const char* cfgInfo); 

/// 关闭浏览器
YL_SDK_API void StopBrowser(const char* envId);

/// 获取所有已启动的环境列表
YL_SDK_API void QueryAllLaunchedBrowsers(QueryAllLaunchedBrowserCallback callback);

///
YL_SDK_API void Test();

}

END_YL_SDK_NAMESPACE



#endif//YUN_LOGIN_SDK_H_
