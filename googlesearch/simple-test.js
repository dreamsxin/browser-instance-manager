// simple-test.js - 简化版测试脚本
const axios = require('axios');

async function quickTest() {
    const baseURL = 'http://localhost:3000';
    const keywords = ['javascript', 'python', 'java', 'golang', 'rust', 'nodejs', 'react', 'vue'];
    
    console.log('🚀 开始快速测试...\n');
    
    for (let i = 0; i < keywords.length; i++) {
        const keyword = keywords[i];
        try {
            const start = Date.now();
            const response = await axios.get(`${baseURL}/google/search`, {
                params: { keyword },
                timeout: 10000
            });
            const duration = Date.now() - start;
            
            if (response.status === 200) {
                console.log(`✅ [${i + 1}/${keywords.length}] "${keyword}" - 成功 (${duration}ms)`);
                console.log(`   数据长度: ${response.data.dataLength} 字符`);
            } else {
                console.log(`❌ [${i + 1}/${keywords.length}] "${keyword}" - 失败: ${response.status}`);
            }
        } catch (error) {
            console.log(`💥 [${i + 1}/${keywords.length}] "${keyword}" - 错误: ${error.message}`);
        }
        
        // 短暂延迟
        if (i < keywords.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    console.log('\n🏁 快速测试完成!');
}

quickTest().catch(console.error);