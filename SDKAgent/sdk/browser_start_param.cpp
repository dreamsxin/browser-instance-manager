#include "pch.h"
#include "http_server/browser_start_param.h"

#include "cmmlib/utf_string_conversions.h"
#include "cmmlib/url_encode.h"

#include "browser/browser_launch_param.h"

BEGIN_YL_SDK_NAMESPACE
namespace http_server {

bool BrowserStartReqParam::Parse(const std::string& jsonString) {

    if (jsonString.empty()) return false;

    try {
        rapidjson::Document doc;
        doc.Parse<0>(jsonString.c_str());
        if (!doc.IsObject()) return false;

        if (doc.HasMember("env_id") && doc["env_id"].IsString()) {
            this->envId = doc["env_id"].GetString();
        }

        if (doc.HasMember("urls") && doc["urls"].IsArray()) {
            const rapidjson::Value& open_urlsValue = doc["urls"];
            for (size_t i = 0; i < open_urlsValue.Size(); ++i) {
                const rapidjson::Value& value = open_urlsValue[i];
                if (value.IsString()) {
                    this->urls.push_back(base::UTF8ToWide(value.GetString()));
                }
            }
        }

        if (doc.HasMember("headless") && doc["headless"].IsString()) {
            this->headless = doc["headless"].GetString();
        }

        if (doc.HasMember("bypasslist") && doc["bypasslist"].IsString()) {
            this->bypasslist = doc["bypasslist"].GetString();
        }

        //noSandbox
        if (doc.HasMember("no_sandbox") && doc["no_sandbox"].IsInt()) {
            this->noSandbox = doc["no_sandbox"].GetInt();
        }
        
        if (doc.HasMember("append_cmd") && doc["append_cmd"].IsString()) {
            this->appendCmd = doc["append_cmd"].GetString();
        }

        if (doc.HasMember("extension") && doc["extension"].IsString()) {
            this->extension = base::UTF8ToWide(doc["extension"].GetString());
        }

        if (doc.HasMember("cookies") && doc["cookies"].IsString()) {
            this->cookies = doc["cookies"].GetString();
        }

        if (doc.HasMember("proxy") && doc["proxy"].IsObject()) {
            rapidjson::Value& proxyValue = doc["proxy"];

            if (proxyValue.HasMember("protocol") && proxyValue["protocol"].IsString()) {
                this->proxy.protocol = proxyValue["protocol"].GetString();
            }

            if (proxyValue.HasMember("host") && proxyValue["host"].IsString()) {
                this->proxy.host = proxyValue["host"].GetString();
            }

            if (proxyValue.HasMember("port") && proxyValue["port"].IsInt()) {
                this->proxy.port = proxyValue["port"].GetInt();
            }

            if (proxyValue.HasMember("userName") && proxyValue["userName"].IsString()) {
                this->proxy.userName = proxyValue["userName"].GetString();
            }

            if (proxyValue.HasMember("password") && proxyValue["password"].IsString()) {
                this->proxy.password = proxyValue["password"].GetString();
            }
        }

        if (doc.HasMember("blacklist") && doc["blacklist"].IsArray()) {
            const rapidjson::Value& blacklistValue = doc["blacklist"];
            for (size_t i = 0; i < blacklistValue.Size(); ++i) {
                const rapidjson::Value& value = blacklistValue[i];
                if (value.IsString()) {
                    this->blacklist.push_back(value.GetString());
                }
            }
        }

        if (doc.HasMember("remote_debugging") && doc["remote_debugging"].IsInt()) {
            this->enableRemotingDebugging = doc["remote_debugging"].GetInt() > 0 ? true : false;
        }

        if (doc.HasMember("remote_debugging_port") && doc["remote_debugging_port"].IsInt()) {
            this->remoteDebuggingPort = doc["remote_debugging_port"].GetInt();
        }

        if (doc.HasMember("remote_debugging_address") && doc["remote_debugging_address"].IsString()) {
            this->remoteDebuggingAddress = doc["remote_debugging_address"].GetString();
        }

        if (doc.HasMember("remote_debugging_protocol") && doc["remote_debugging_protocol"].IsString()) {
            this->remoteDebuggingProtocol = doc["remote_debugging_protocol"].GetString();
        }

        if (doc.HasMember("custom_data") && doc["custom_data"].IsString()) {
            this->customData = doc["custom_data"].GetString();
        }

        if (doc.HasMember("accelerator_keys") && doc["accelerator_keys"].IsString()) {
            this->acceleratorKeys = doc["accelerator_keys"].GetString();
        }

        if (doc.HasMember("enable_extension_getall") && doc["enable_extension_getall"].IsInt()) {
            this->enableExtensionGetAll = doc["enable_extension_getall"].GetInt();
        }
        
        if (doc.HasMember("copy_plugins") && doc["copy_plugins"].IsString()) {
            this->copyPlugins = doc["copy_plugins"].GetString();
        }

        if (doc.HasMember("cdp_mask") && doc["cdp_mask"].IsInt()) {
            this->cdpMask = doc["cdp_mask"].GetInt();
        }

        //if (doc.HasMember("enable_console") && doc["enable_console"].IsInt()) {
        //    this->enableConsole = doc["enable_console"].GetInt();
        //}
        if (doc.HasMember("enable_devtools_all") && doc["enable_devtools_all"].IsInt()) {
            this->enable_devtools_all = doc["enable_devtools_all"].GetInt();
        }

         if (doc.HasMember("site_accounts") && doc["site_accounts"].IsArray()) {
             const rapidjson::Value& site_accountsValue = doc["site_accounts"];
             for (size_t i = 0; i < site_accountsValue.Size(); ++i) {
                 const rapidjson::Value& value = site_accountsValue[i];

                 std::string username, pwd, site;
                 if (value.HasMember("user") && value["user"].IsString()) {
                     username = value["user"].GetString();
                 }
                 if (value.HasMember("pwd") && value["pwd"].IsString()) {
                     pwd = value["pwd"].GetString();
                 }
                 if (value.HasMember("site") && value["site"].IsString()) {
                     site = value["site"].GetString();
                 }

                 if (!username.empty() && !pwd.empty() && !site.empty()) {
                     browser::SiteAccount::Ptr account = std::make_shared<browser::SiteAccount>();
                     account->username = username;
                     account-> pwd = pwd;
                     account->site = site;
                     this->site_accounts.push_back(account);
                 }

             }
            this->enable_devtools_all = doc["site_accounts"].GetInt();
        }


        if (doc.HasMember("envName") && doc["envName"].IsString()) {
            this->envName = doc["envName"].GetString();
        }
        if (doc.HasMember("serial") && doc["serial"].IsString()) {
            this->serial = doc["serial"].GetString();
        }
        if (doc.HasMember("kernel") && doc["kernel"].IsString()) {
            this->kernel = doc["kernel"].GetString();
        }
        if (doc.HasMember("kernelVersion") && doc["kernelVersion"].IsString()) {
            this->kernelVersion = doc["kernelVersion"].GetString();
        }
        if (doc.HasMember("lang") && doc["lang"].IsString()) {
            this->lang = doc["lang"].GetString();
        }

        if (doc.HasMember("cdk") && doc["cdk"].IsString()) {
            this->cdk = doc["cdk"].GetString();
        }
        if (doc.HasMember("finger") && doc["finger"].IsString()) {
            this->finger = doc["finger"].GetString();
        }

        if (this->appendCmd.find("--remote-allow-origins") == std::string::npos) {
            if (!this->appendCmd.empty()) {
                this->appendCmd.append(" ");
            }
            this->appendCmd.append("--remote-allow-origins=*");
        }

        return true;
    }
    catch (...) {

    }
    return false;
}

bool BrowserStartReqParam::IsValid() const {
    if (envId.empty()) {
        return false;
    }
    return true;
}

void BrowserStartReqParam::ToBrowserLaunchParam(browser::BrowserLaunchParam& param) {
    param.envId = this->envId;
    param.headless = this->headless == "1" ? true:false;
    param.bypasslist = this->bypasslist;
    param.noSandbox = this->noSandbox;
    param.urls = this->urls;
    param.appendCmd = this->appendCmd;
    param.extension = this->extension;
    param.cookies = this->cookies;
    param.proxy = std::make_shared<browser::ProxyInfo>(this->proxy);
    param.blacklist = this->blacklist;
    param.enableRemotingDebugging = this->enableRemotingDebugging;
    param.remoteDebuggingPort = this->remoteDebuggingPort;
    param.remoteDebuggingAddress = base::UTF8ToWide(this->remoteDebuggingAddress);
    param.remoteDebuggingProtocol = this->remoteDebuggingProtocol;
    param.customData = this->customData;
    param.acceleratorKeys = this->acceleratorKeys;
    param.enableExtensionGetAll = this->enableExtensionGetAll;
    param.cdpMask = this->cdpMask;
    //param.enableConsole = this->enableConsole;
    param.enable_devtools_all = this->enable_devtools_all;
    param.copyPlugins = this->copyPlugins;

    param.site_accounts = this->site_accounts;

    // ÉèÖÃä¯ÀÀÆ÷ÄÚºË
	param.kernel = this->kernel;
	param.kernelVersion = this->kernelVersion;

	// ÓïÑÔ
    param.lang = base::UTF8ToWide(this->lang);

	// 
	param.shopInfo = std::make_shared<browser::StopInfo>();
	param.shopInfo->shopId = this->envId;
	param.shopInfo->name = this->envName;
	param.shopInfo->serial = this->serial;

	//
	param.fingerInfo = std::make_shared<browser::FingerInfo>();
	param.fingerInfo->finger = this->finger;
	param.cdk = this->cdk;

    param.fingerInfo = std::make_shared<browser::FingerInfo>();
    param.fingerInfo->finger = this->finger;
}

} // namespace http_server
END_YL_SDK_NAMESPACE