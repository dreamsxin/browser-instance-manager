// test.cpp : This file contains the 'main' function. Program execution begins and ends there.
//

#include "httplib.h"
#include "nlohmann/json.hpp"
#include "sdk/yl_sdk_def.h"
#include "sdk/yl_sdk.h"

#pragma comment(lib, "yl_sdk.lib")
#pragma comment(lib, "ws2_32.lib")

#include <iostream>
#include <Windows.h>
#include <vector>
#include <string>

#include <codecvt> // codecvt_utf8
#include <locale>  // wstring_convert

// encoding function
std::string to_utf8(std::wstring& wide_string)
{
	static std::wstring_convert<std::codecvt_utf8<wchar_t>> utf8_conv;
	return utf8_conv.to_bytes(wide_string);
}

std::wstring from_utf8(std::string& str)
{
	static std::wstring_convert<std::codecvt_utf8<wchar_t>> utf8_conv;
	return utf8_conv.from_bytes(str);
}

std::wstring StringToWideString(const std::string& str) {
	int size = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, nullptr, 0);
	std::wstring wstr(size, 0);
	MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, &wstr[0], size);
	return wstr;
}

class BrowserEventDelegateImpl : public YLSDK::BrowserEventDelegate {
public:
    void OnBrowserOpening(const char* envId, const char* customData, int process) override {
        std::cout << "OnBrowserOpening: " << envId << " process: " << process << std::endl;
    }

    void OnBrowserOpenResult(const char* envId, const char* customData, int code, const char* errMsg, const char* remoteDebuggingInfo) override {
		// local 本地错误
		//FAILED_REQUEST_API_BROWSER_CONFIG = -200,
		//FAILED_PARSE_JSON = -300, // json格式错误
		//FAILED_LAUNCH_BROWSER = -400, // 启动失败
		//FAILED_USER_STOPPED = -402, // 启动过程中，用户取消启动
		//FAILED_NO_KERNEL_EXIST = -405, // 内核不存在

        std::cout << "OnBrowserOpenResult: " << envId << " code: " << code << " errMsg: " << errMsg
            << " remoteDebuggingInfo: " << remoteDebuggingInfo << std::endl;
    }

    void OnBrowserClosed(const char* envId, const char* customData) override {
        std::cout << "OnBrowserClosed: " << envId << std::endl;

		nlohmann::json js = {
		  {"event","closed"},
		  {"envId",envId},
		};
    }

    void OnBrowserCookiesExported(const char* envId, const char* customData, const char* cookies) override {
        std::cout << "OnBrowserCookiesExported: " << envId << std::endl;
        std::cout << "customData: " << customData << std::endl;
        std::cout << "cookies: " << cookies << std::endl;
    }

};

// 全局原子变量控制服务器运行
std::atomic<bool> g_server_running(false);

// 线程函数封装服务器监听
void StartServerThread(httplib::Server* svr, const std::string& host, int port) {
	try {
		g_server_running = true;
		std::cout << "Starting HTTP server on " << host << ":" << port << std::endl;
		if (!svr->listen(host.c_str(), port)) {
			std::cerr << "HTTP server failed to start!" << std::endl;
		}
	}
	catch (const std::exception& e) {
		std::cerr << "Server exception: " << e.what() << std::endl;
	}
	g_server_running = false;
}

int QueryAllCallback(const char* envIds) {
	std::cout << "QueryAllCallback: " << envIds << std::endl;
	return 0;
}

int main(int argc, char* argv[])
{
	// 解析命令行参数
	std::string apiUrl;
	std::string coresDir;

	for (int i = 1; i < argc; ++i) {
		std::string arg = argv[i];
		if (arg.compare(0, 10, "--api-url=") == 0) {
			apiUrl = arg.substr(10);
			break;
		}
		else if (arg == "--api-url") {
			if (i + 1 < argc) {
				apiUrl = argv[i + 1];
				i++; // 跳过已处理的参数
				break;
			}
			else {
				std::cerr << "Error: Missing value for --api-url" << std::endl;
				return 1;
			}
		}
		// 处理 --cores-dir
		else if (arg.compare(0, 12, "--cores-dir=") == 0) {
			coresDir = arg.substr(12);
		}
		else if (arg == "--cores-dir") {
			if (i + 1 < argc) {
				coresDir = argv[++i];
			}
			else {
				std::cerr << "Error: Missing value for --cores-dir" << std::endl;
				return 1;
			}
		}
	}

    std::cout << "SDK Version: " << YLSDK::GetSDKVersion() << std::endl;

    std::unique_ptr<BrowserEventDelegateImpl> delegateImpl(std::move(std::make_unique<BrowserEventDelegateImpl>()));

    YLSDK::InitParam param;
    param.companyName = L"Ushop";
    param.brandingName = L"UshopBrowser";
    param.appId = L"xxxxxxxxxxxxxxxx";
    param.appSecret = L"xxxxxxxxxxxxxxxx";
	param.browserCoresDir = L"D:\\go\\src\\SDKTest\\release_onstage_0717\\demo\\browser";
		// 设置浏览器核心目录
	if (!coresDir.empty()) {
		auto tmp = from_utf8(coresDir);
		param.browserCoresDir = tmp.c_str();
	}

    YLSDK::InitSDK(param, delegateImpl.get());

    YLSDK::SDKInfo info;
    YLSDK::GetSDKInfo(info);

    YLSDK::Test();


    std::cout << "Http port: " << info.port << std::endl;


    // HTTP
    httplib::Server svr;

    svr.Get("/hi", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("Hello World!", "text/plain");
    });

    svr.Get("/start", [](const httplib::Request&, httplib::Response& res) {

		std::string finger = u8R"###({
				"ClientHints": {
					"Product": "Gecko",
					"architecture": "x86",
					"bitness": "64",
					"mobile": "0",
					"model": "",
					"platform": "Windows",
					"platformVersion": "10.0.0",
					"uaFullVersion": "107.0.5304.9"
				},
				"acceptLanguage": "zh-CN,zh;q=0.9",
				"appCodeName": "Mozilla",
				"appName": "Netscape",
				"appVersion": "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.5304.9 Safari/537.36",
				"audio": -29.11,
				"audioInputs": null,
				"audioOutputs": null,
				"batteryCharging": true,
				"batteryChargingTime": 13,
				"batteryDischargingTime": 0,
				"batteryLevel": 38,
				"batteryLevelF": "0.38",
				"batteryType": "Assign",
				"blockPortScanning": true,
				"bluetoothDisabled": 1,
				"browser": "Chrome",
				"canvasFontEnabled": 1,
				"canvasFontX": -0.0632,
				"canvasFontY": -0.0894,
				"canvasPerturbEnabled": 1,
				"canvasPerturbX": -0.0517,
				"canvasPerturbY": -0.095,
				"clientRects": 1,
				"colorDepth": 24,
				"colorGamut": "srgb",
				"commonPerturb": 93442229,
				"computerName": "DESKTOP-lGmrANw",
				"cpu": 16,
				"deviceMemory": 8,
				"devicePixelRatio": 1,
				"dnt": "1",
				"enableCookie": 0,
				"enableGPU": 1,
				"enablenotice": 1,
				"enableopen": 0,
				"enablepic": 0,
				"enablesound": 0,
				"enablevideo": 0,
				"fonts": "\"Segoe UI\",Cambria Math,Leelawadee UI,Segoe Fluent Icons,Arial,\"Cambria Math\",\"Noto Sans Coptic\",Nirmala UI,HoloLens MDL2 Assets,\"STIXIntegralsSm-Bold\"",
				"fontsFull": "\"Noto Serif Ahom\",\"Noto Sans Armenian\",\"Helvetica LT MM\",\"MS Gothic\",\"Kristen ITC\",\"Aqua Kana Bold\",\"MS Reference Sans Serif\",\"Microsoft Tai Le\",\"STIXIntegralsUp-Regular\",\"MV Boli Regular\",\"Segoe Fluent Icons\",\"Arial\",\"Noto Sans Elbasan\",\"Malgun Gothic Semilight\",\"Cochin\",\"LastResort\",\"Malgun Gothic\",\"Bradley Hand ITC\",\"Lucida Grande\",\"Rockwell\",\"Tahoma\",\"Bookman Old Style\",\"Geneva\",\"EUROSTILE\",\"Sitka Banner\",\"Copperplate Gothic\",\"Garamond\",\"Cambria\",\"Webdings\",\"Ayuthaya\",\"PT Sans Caption\",\"Noto Sans Osmanya\",\"STIXNonUnicode-Regular\",\"Terminal\",\"Noto Sans Syriac\",\"Shree Devanagari 714 Italic\",\"STIXIntegralsSm\",\"Copperplate GothicLight\",\"Bitstream Vera Sans Mono\",\"Charter\",\"Rockwell Extra Bold\",\"Noto Sans Myanmar\",\"Noto Sans Ol Chiki\",\"Noto Sans Cypriot\",\"STIXNonUnicode-Bold\",\"Onyx\",\"Noto Sans Samaritan\",\"Noto Sans Tagalog\",\"Segoe UI\",\"Apple SD Gothic Neo\",\"Noto Sans Miao\",\"Microsoft YaHei Light\",\"Avenir Book\",\"Bangla MN\",\"Academy Engraved LET\",\"Roman Regular\",\"Sitka Subheading\",\"Apple Braille Outline 6 Dot\",\"Snell Roundhand\",\"STIXSizeTwoSym\",\"STIXSizeFiveSym\",\"Damascus\",\"Cambria Math\",\"Constantia\",\"MS PGothic Regular\",\"Sylfaen\",\"Hiragino Sans W4\",\"SimSun-ExtB Regular\",\"Noto Sans Tai Tham\",\"Noto Sans Hanunoo\",\"Avenir Next Condensed Heavy\",\"Bodoni MT\",\"Noto Sans Glagolitic\",\"Britannic Bold\",\"Ebrima\",\"Clarendon\",\"STIXIntegralsSm-Bold\",\"Noto Sans Lycian\",\"Lucida Console Regular\",\"Palatino Linotype\",\"Franklin Gothic\",\"Lucida Console\",\"STIXNonUnicode-Italic\",\"MS Serif\",\"Palatino\",\"MS PMincho\",\"Aldhabi\",\"Hiragino Mincho Pro\",\"Sukhumvit Set\",\"default\",\"Informal Roman\",\"Imprint MT Shadow\",\"NSimSun\",\"Menlo\",\"SimSun-ExtB\",\"Trebuchet MS\",\"Geeza Pro\",\"Al Bayan\",\"Noto Sans Cuneiform\",\"DIN Alternate\",\"Khmer Sangam MN\",\"Caurier Regular\",\"Yu Gothic\",\"Franklin Gothic Medium\",\"Comic Sans\",\"Krungthep\",\"Noto Sans Sora Sompeng\",\"Noto Sans Bhaiksuki\",\"Gadugi\",\"STSong\",\"Hiragino Sans W9\",\"Courier New\",\"MV Boli\",\"STIXIntegralsUpD-Bold\",\"Candara\",\"Comic Sans MS\",\"Noto Sans NKo\",\"Sana\",\"Kohinoor Bangla\",\"Vladimir Script\",\"DengXian Light\",\"Wide Latin\",\"Leelawadee UI\",\"Segoe Print\",\"Myanmar Text\",\"Noto Sans Bamum\",\"Noto Sans Carian\",\"News Gothic MT\",\"Proxy 9\",\"fantasy\",\"Avenir\",\"Microsoft Himalaya\",\"Thonburi\",\"Noto Sans Old Permic\",\"Fixedsys\",\"Noto Sans Egyptian Hieroglyphs\",\"HoloLens MDL2 Assets\",\"Sinhala MN\",\"Hiragino Sans W8\",\"Hiragino Sans GB W3\",\"Noto Sans Sharada\",\"PT Serif\",\"Optima\",\"Microsoft Sans Serif\",\"STFangSong\",\"Arial Black\",\"Bangla Sangam MN\",\"Gujarati Sangam MN\",\"Marlett\",\"Silom\",\"Microsoft Himalaya Regular\",\"STIXIntegralsD-Bold\",\"Heiti SC\",\"Georgia\",\"Freestyle Script\",\"Viner Hand ITC\",\"MingLiU\",\"Noto Sans Mende Kikakui\",\"Small Fonts\",\"Calibri\",\"Symbol\",\"Hiragino Kaku Gothic Pro W6\",\"Google Sans\",\"Noto Sans Adlam\",\"BankGothic Md BT\",\"Mistral\",\"Segoe Script\",\"Microsoft JhengHei UI\",\"Baskerville Old Face\",\"PMingLiU\",\"sans-serif\",\"Microsoft Yi Baiti\",\"MingLiU-ExtB\",\"SimSun\",\"STIXVariants-Regular\",\"MingLiU_HKSCS\",\"Chalkduster\",\"Microsoft New Tai Lue\",\"Mongolian Baiti\",\"Noto Serif Balinese\",\"Proxy 6\",\"Microsoft PhagsPa\",\"Telugu Sangam MN\",\"Futura Bk BT\",\"Microsoft JhengHei UI Light\",\"Roboto\",\"Big Caslon\",\"Impact Regular\",\"Proxy 2\",\"Consolas\",\"Corbel\",\"PMingLiU-ExtB\",\"Sitka Small\",\"AvantGarde Bk BT\",\"Monaco\",\"Palace Script MT\",\"Segoe UI Symbol\",\"Verdana\",\"Hiragino Mincho Pro W6\",\"Chalkboard\",\"Showcard Gothic\",\"Noto Sans Lisu\",\"Hiragino Sans GB W6\",\"Meiryo UI\",\"Hiragino Kaku Gothic StdN W8\",\"Bodoni MT Black\",\"Noto Sans Old South Arabian\",\"Noto Sans Javanese\",\"Party LET\",\"sans-serif-thin\",\"Shree Devanagari 714 Bold\",\"Felix Titling\",\"Microsoft JhengHei\",\"Microsoft YaHei\",\"Javanese Text\",\"STIXIntegralsUpD\",\"MS PGothic\",\"Tamil Sangam MN\",\"Noto Sans Linear A\",\"Farah\",\"Lucida Sans Typewriter\",\"Gabriola\",\"Ink Free\",\"Noto Sans Warang Citi\",\"Aqua Kana\",\"Modern No. 20\",\"Proxy 4\",\"Noto Sans Tai Viet\",\"Noto Sans Coptic\",\"Times\",\"Noto Sans Ugaritic\",\"Broadway\",\"Noto Sans Runic\",\"Hiragino Sans\",\"Chalkboard SE\",\"Gabriola Regular\",\"Kohinoor Gujarati\",\"Noto Sans Phoenician\",\"Hiragino Maru Gothic Pro W4\",\"Impact\",\"Lucida Sans Unicode\",\"Segoe MDL2 Assets\",\"Bahnschrift\",\"Avenir Next Condensed Medium\",\"Batang\",\"Charter Black\",\"Noto Sans Thaana\",\"Segoe UI Emoji Regular\",\"STIXSizeThreeSym-Bold\",\"Arial Rounded MT Bold\",\"PT Serif Caption\",\"Bodoni 72 Smallcaps\",\"Lucida Bright\",\"STIXSizeFourSym-Bold\",\"Microsoft JhengHei Regular\",\"STIXSizeThreeSym\",\"Papyrus\",\"MS UI Gothic\",\"MingLiU_HKSCS-ExtB\",\"Segoe UI Emoji\",\"Nirmala UI\",\"Proxy 1\",\"Shree Devanagari 714 Bold Italic\",\"Kailasa\"",
				"geographic": {
					"accuracy": "5272",
					"enable": 1,
					"latitude": "0.000000",
					"longitude": "0.000000"
				},
				"glyphsMeasureTextDX": -0.9548,
				"iceServers": null,
				"languages": ["zh-CN"],
				"macAddress": "4C-79-6E-F5-BC-59",
				"mediaMimes": [{
					"can_play": "probably",
					"type": "video/mp4; codecs=\"avc1.42E01E\""
				}, {
					"can_play": "probably",
					"type": "video/webm; codecs=\"vp9\""
				}, {
					"can_play": "maybe",
					"type": "video/mp4; codecs=\"avc1.42E01E\""
				}, {
					"can_play": "maybe",
					"type": "video/ogg; codecs=\"theora\""
				}, {
					"can_play": "maybe",
					"type": "video/quicktime"
				}],
				"mediaType": "Assign",
				"picsize": "",
				"platform": "Win32",
				"pluginType": "Assign",
				"plugins": [{
					"description": "Portable Document Format",
					"filename": "internal-pdf-viewer",
					"name": "PDF Viewer",
					"version": ""
				}, {
					"description": "Portable Document Format",
					"filename": "internal-pdf-viewer",
					"name": "Chromium Viewer",
					"version": ""
				}, {
					"description": "Portable Document Format",
					"filename": "internal-pdf-viewer",
					"name": "WebKit built-in PDF",
					"version": ""
				}],
				"portScanningWhitelist": "2511,6599,1911,6660,4227,1165,5863,5246",
				"product": "Gecko",
				"rectDX": 0.6805,
				"screenSize": "",
				"speechVoices": [{
					"is_default": 0,
					"is_local_service": 0,
					"lang": "de-DE",
					"name": "Google Deutsch",
					"voice_uri": "Google Deutsch"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "en-U",
					"name": "Google US English",
					"voice_uri": "Google US English"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "en-GB",
					"name": "Google UK English Female",
					"voice_uri": "Google UK English Female"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "en-GB",
					"name": "Google UK English Male",
					"voice_uri": "Google UK English Male"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "es-ES",
					"name": "Google español",
					"voice_uri": "Google español"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "es-US",
					"name": "Google español de Estados Unidos",
					"voice_uri": "Google español de Estados Unidos"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "fr-FR",
					"name": "Google français",
					"voice_uri": "Google français"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "hi-IN",
					"name": "Google हिन्दी",
					"voice_uri": "Google हिन्दी"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "id-ID",
					"name": "Google Bahasa Indonesia",
					"voice_uri": "Google Bahasa Indonesia"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "it-IT",
					"name": "Google italiano",
					"voice_uri": "Google italiano"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "ja-JP",
					"name": "Google 日本語",
					"voice_uri": "Google 日本語"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "ko-KR",
					"name": "Google 한국의",
					"voice_uri": "Google 한국의"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "nl-NL",
					"name": "Google Nederlands",
					"voice_uri": "Google Nederlands"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "pl-PL",
					"name": "Google polski",
					"voice_uri": "Google polski"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "pt-BR",
					"name": "Google português do Brasil",
					"voice_uri": "Google português do Brasil"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "ru-RU",
					"name": "Google русский",
					"voice_uri": "Google русский"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "zh-CN",
					"name": "Google 普通话（中国大陆）",
					"voice_uri": "Google 普通话（中国大陆）"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "zh-HK",
					"name": "Google 粤語（香港）",
					"voice_uri": "Google 粤語（香港）"
				}, {
					"is_default": 0,
					"is_local_service": 0,
					"lang": "zh-TW",
					"name": "Google 國語（臺灣）",
					"voice_uri": "Google 國語（臺灣）"
				}],
				"speeches": ["Rudolph", "Clayton", "Alva", "Harley", "Cleveland", "Sylvester"],
				"storage": "480308542803",
				"textMetricsBoundingDX": -0.0432,
				"timezone": "Asia/Shanghai",
				"userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.5304.9 Safari/537.36",
				"vendor": "Google Inc.",
				"version": 2,
				"videoInputs": null,
				"webglEnabled": 1,
				"webglPerturbX": 18.3,
				"webglRenderer": "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)",
				"webglType": "Assign",
				"webglVendor" : "Google Inc. (Intel)",
				"webrtcInnerIp" : "",
				"webrtcMode" : "Forbidden",
				"webrtcPublicIp" : "",
				"windowSize" : ""
            })###";

		nlohmann::json js = nlohmann::json::parse(u8R"(
			{
				   "env_id": "test",
				   "urls": [
					   "www.baidu.com", "www.163.com"
				   ],
				   "append_cmd": "",
				   "cookies": "",
				   "proxy": {
					   "protocol": "http",
					   "host": "192.168.0.171",
					   "port": 10809,
					   "userName": "",
					   "password": ""
				   },
				   "blacklist": [
					   "taobao.com"
				   ],
				   "remote_debugging": 1,
				   "remote_debugging_address": "",
				   "kernel": "chrome",
				   "kernelVersion": "127",
                   "customerId":"customerId"
			}
		)");

		js["finger"] = finger;
		try {
			std::cout << "start json: " << js.dump() << std::endl;
			auto ret = YLSDK::StartBrowser("test", js.dump().c_str());
			char buf[100];
			sprintf(buf, "start ret %d", ret);
			res.set_content(buf, "text/plain");
		}
		catch (std::exception& e) {
			std::string val;
			auto s = e.what();
			for (size_t i = 0; s[i]; i++) {
				switch (s[i]) {
				case '\r': val += "\\r"; break;
				case '\n': val += "\\n"; break;
				default: val += s[i]; break;
				}
			}

			res.status = httplib::StatusCode::InternalServerError_500;
			res.set_header("EXCEPTION_WHAT", val);
			std::cerr << "start err: " << val << std::endl;
		}
    });

	svr.Post("/start/:envId", [](const httplib::Request& req, httplib::Response& res) {

		auto envId = req.path_params.at("envId");
		std::cout << "start" << envId << std::endl;
		auto ret = YLSDK::StartBrowser(envId.c_str(), req.body.c_str());
		if (ret) {
			res.set_content("ok", "text/plain");
		}
		else {
			res.status = httplib::StatusCode::InternalServerError_500;
			res.set_content("fail", "text/plain");
		}
	});

	svr.Get("/stop/:envId", [](const httplib::Request& req, httplib::Response& res) {
		auto envId = req.path_params.at("envId");
		std::cout << "stop" << envId << std::endl;
		YLSDK::StopBrowser(envId.c_str());
		res.set_content("ok", "text/plain");
	});

	svr.Get("/list", [](const httplib::Request&, httplib::Response& res) {
		
		std::cout << "list" << std::endl;
		YLSDK::QueryAllLaunchedBrowsers(QueryAllCallback);
		res.set_content("ok", "text/plain");
	});

	// 启动服务器线程
	std::thread server_thread(StartServerThread, &svr, "0.0.0.0", 8080);
	server_thread.detach();  // 分离线程独立运行
   //svr.listen("0.0.0.0", 8080);

    MSG msg;
    while (GetMessage(&msg, nullptr, 0, 0)) {
        ::TranslateMessage(&msg);
        ::DispatchMessage(&msg);
		// 主循环每处理完消息检查服务器状态
		if (!g_server_running) {
			// 处理服务器崩溃
			std::cerr << "服务器状态异常" << std::endl;
			break;
		}
    }

    YLSDK::CleanUPSDK();

    return 0;
}

