/**
 * 默契画猜 - 服务端游戏逻辑
 * 双人合作画猜闯关游戏
 */

// ===== 词库 =====
const WORD_BANKS = {
  // Level 1: 新手画师 - 具体事物，5秒内能理解
  easy: [
    // 动物 40
    '猫','狗','兔子','老虎','狮子','熊猫','猴子','长颈鹿','大象','河马',
    '乌龟','青蛙','鸭子','公鸡','企鹅','海豚','鲸鱼','鲨鱼','章鱼','螃蟹',
    '蝴蝶','蜜蜂','蚂蚁','蜗牛','蛇','老鼠','马','牛','羊','猪',
    '鸡','鸽子','鹦鹉','啄木鸟','老鹰','孔雀','袋鼠','考拉','北极熊','骆驼',
    // 水果 30
    '苹果','香蕉','西瓜','葡萄','橙子','梨','桃子','草莓','樱桃','菠萝',
    '芒果','柠檬','椰子','石榴','火龙果','猕猴桃','哈密瓜','荔枝','蓝莓','山竹',
    '柚子','木瓜','杨梅','桑葚','榴莲','柿子','李子','杏','无花果','百香果',
    // 日用品 50
    '牙刷','牙膏','梳子','镜子','毛巾','雨伞','水杯','拖鞋','书包','手机',
    '电脑','电视','冰箱','空调','风扇','台灯','闹钟','钥匙','锁','剪刀',
    '胶带','尺子','橡皮','铅笔','钢笔','笔记本','订书机','回形针','图钉','计算器',
    '充电器','耳机','鼠标','键盘','打印机','吹风机','剃须刀','指甲刀','掏耳勺','眼镜',
    '帽子','围巾','手套','袜子','皮带','钱包','背包','行李箱','雨衣','太阳镜',
    // 交通工具 40
    '汽车','公交车','火车','高铁','飞机','轮船','自行车','摩托车','地铁','出租车',
    '救护车','消防车','警车','卡车','推土机','吊车','挖掘机','直升机','帆船','快艇',
    '滑板车','三轮车','电动车','缆车','热气球','火箭','坦克','拖拉机','校车','观光车',
    '独木舟','皮划艇','冲浪板','降落伞','滑雪板','溜冰鞋','平衡车','滑翔机','潜水艇','飞碟',
    // 运动用品 40
    '篮球','足球','排球','乒乓球','羽毛球','网球','哑铃','跳绳','滑板','头盔',
    '拳击手套','棒球棒','高尔夫球','保龄球','飞镖','弓箭','杠铃','瑜伽垫','跑步机','拉力器',
    '接力棒','标枪','铁饼','铅球','撑杆','跨栏','沙坑','泳镜','泳帽','浮板',
    '滑雪杖','冰刀','球门','球网','裁判哨','记分牌','秒表','口哨','运动鞋','护膝'
  ],
  // Level 2: 灵魂画手 - 职业/场景/动作
  medium: [
    // 职业 50
    '老师','医生','警察','消防员','快递员','程序员','厨师','司机','农民','歌手',
    '演员','画家','记者','律师','护士','军人','宇航员','科学家','建筑师','摄影师',
    ' DJ','主持人','模特','运动员','教练','裁判','保安','清洁工','收银员','服务员',
    '理发师','化妆师','设计师','导演','制片人','编剧','编辑','翻译','导游','兽医',
    '电工','水管工','木匠','铁匠','花匠','面包师','调酒师','健身教练','瑜伽教练','心理咨询师',
    // 地点 50
    '学校','医院','超市','电影院','机场','火车站','图书馆','游乐园','动物园','博物馆',
    '美术馆','科技馆','水族馆','植物园','公园','广场','步行街','美食街','夜市','菜市场',
    '银行','邮局','公安局','消防局','法院','政府','教堂','寺庙','道观','清真寺',
    '咖啡馆','奶茶店','书店','花店','宠物店','理发店','健身房','游泳池','篮球场','足球场',
    '高尔夫球场','滑雪场','海滩','沙漠','森林','山谷','瀑布','湖泊','岛屿','北极',
    // 天气 20
    '下雨','下雪','打雷','彩虹','龙卷风','台风','暴风雪','沙尘暴','大雾','冰雹',
    '晴天','多云','阴天','小雨','大雨','暴雨','阵雨','毛毛雨','雷阵雨','太阳雨',
    // 动作 80
    '睡觉','跑步','跳舞','游泳','吃饭','喝水','刷牙','写字','唱歌','拍照',
    '打电话','发短信','上网','打游戏','看电影','听音乐','读书','画画','做饭','洗碗',
    '扫地','拖地','擦窗户','洗衣服','晾衣服','叠衣服','铺床','浇花','遛狗','喂猫',
    '开车','骑车','坐飞机','坐船','爬山','滑雪','冲浪','潜水','跳伞','蹦极',
    '打篮球','打足球','打乒乓球','打羽毛球','打网球','打排球','打棒球','打高尔夫',
    '打拳击','打太极','练瑜伽','做体操','跳高','跳远','扔铅球','投标枪','撑杆跳',
    '射箭','击剑','摔跤','柔道','跆拳道','空手道','武术','举重','拔河','跳绳',
    '踢毽子','放风筝','堆雪人','打雪仗','钓鱼','划船','骑马','射箭','打猎','野营'
  ],
  // Level 3: 极速挑战 - 组合词/联想
  hard: [
    // 校园 60
    '考试','挂科','补考','毕业','军训','论文','答辩','迟到','早八','查寝',
    '自习','预习','复习','刷题','期中考试','期末考试','开卷考试','闭卷考试','重修','满绩',
    '绩点','奖学金','保研','考研','考公','考编','四六级','实验课','实验报告','课程设计',
    '毕业设计','查重','参考文献','导师','开题报告','文献综述','赶DDL','小组作业','课堂展示','PPT答辩',
    '随机提问','课堂测验','签到','网课','抢课','选修课','学分','成绩单','学霸','学渣',
    '室友','上铺','下铺','熄灯','断电','断网','开黑','追剧','泡面','夜聊',
    // 网络 50
    '点赞','关注','直播','弹幕','短视频','热搜','网购','外卖','快递','快递站',
    '奶茶','优惠券','满减','学生认证','校园邮箱','开黑','五排','王者荣耀','和平精英','原神',
    'LOL','Steam','下载更新','掉线','460','挂机队友','代练','刷视频','刷微博','水群',
    '摸鱼','潜水','表情包','拼多多','淘宝','京东','菜鸟驿站','饭卡','校园卡','校园巴士',
    '校园跑','晨跑','夜跑','体测','引体向上','1000米','800米','肺活量','立定跳远','仰卧起坐',
    // 生活 50
    '堵车','加班','熬夜','减肥','健身','搬家','相亲','约会','旅游','露营',
    '烧烤','火锅','自助餐','外卖小哥','共享单车','充电宝','二维码','扫码支付','人脸识别','指纹解锁',
    '快递柜','外卖柜','自动售货机','娃娃机','抓娃娃','扭蛋机','盲盒','剧本杀','密室逃脱','桌游',
    '露营','野餐','烧烤','火锅','奶茶店','咖啡店','书店','电影院','KTV','网吧',
    '棋牌室','台球室','保龄球馆','溜冰场','蹦床公园','攀岩馆','射箭馆','卡丁车','真人CS','漂流',
    // 影视 40
    '奥特曼','蜘蛛侠','钢铁侠','哈利波特','机器人','变形金刚','忍者神龟','哥斯拉','金刚','侏罗纪',
    '阿凡达','黑客帝国','盗梦空间','星际穿越','复仇者联盟','美国队长','雷神','绿巨人','黑寡妇','鹰眼',
    '蝙蝠侠','超人','神奇女侠','闪电侠','海王','小丑','灭霸','洛基','格鲁特','蜘蛛侠',
    '唐老鸭','米老鼠','灰姑娘','白雪公主','艾莎','安娜','花木兰','孙悟空','猪八戒','沙和尚'
  ],
  // Level 4: 三笔大师 - 高辨识度，三笔也能表达（不与easy/medium/hard重复）
  expert: [
    '火箭','皇冠','月亮','太阳','钻石','骷髅','心脏','奖杯','城堡','恐龙',
    '闪电','彩虹','雪花','树叶','花朵','蝴蝶结','蜗牛壳','鱼骨','鸡腿','薯条',
    '可乐','啤酒','咖啡杯','高跟鞋','领带','戒指','王冠','盾牌','宝剑','斧头',
    '锤子','扳手','螺丝刀','齿轮','弹簧','链条','绳子','旗帜','路标','红绿灯',
    '方向盘','轮胎','螺旋桨','船锚','望远镜','放大镜','指南针','温度计','天平',
    '音符','吉他','钢琴','鼓','小提琴','喇叭','话筒','地球仪','沙漏','墓碑',
    '十字架','佛像','花瓶','蜡烛台','地图','算盘','收音机','手电筒','电池',
    '插头','插座','日历','信封','邮票','印章','棋子','骰子','扑克牌',
    '陀螺','弹弓','气球','泡泡','蜡笔','颜料','画框','相框',
    '香肠','薯片','饼干','棒棒糖','棉花糖','巧克力','甜甜圈','爆米花','口香糖',
    '权杖','宝箱','藏宝图','海盗船','灯塔','风车','水车','石桥','木屋','稻草人',
    '钢琴键','小丑','木偶','机器人','外星人','飞碟','宇航服','望远镜','显微镜','试管'
  ],
  // Level 5: 盲画危机 - 抽象概念
  hard2: [
    // 情绪 20
    '开心','难过','愤怒','害怕','焦虑','紧张','尴尬','后悔','孤独','幸福',
    '兴奋','无聊','困惑','惊讶','嫉妒','内疚','羞耻','自豪','感动','绝望',
    // 人生 20
    '梦想','未来','青春','命运','人生','自由','成长','坚持','努力','放弃',
    '成功','失败','选择','改变','勇气','责任','信任','背叛','原谅','释怀',
    // 网络热词 20
    '摸鱼','摆烂','内卷','躺平','社恐','社牛','破防','emo','开摆','佛系',
    'YYDS','绝绝子','无语','离谱','真香','打脸','杠精','键盘侠','柠檬精','凡尔赛',
    // 关系 15
    '爱情','友情','亲情','暗恋','失恋','表白','分手','异地恋','网恋','相亲',
    '出轨','劈腿','备胎','舔狗','单身狗',
    // 奇葩词 25
    '老板画饼','论文爆炸','宿管查寝','食堂阿姨','考试周','凌晨三点','队友挂机','甲方改需求',
    '导师已读不回','老师拖堂','早八起不来','论文查重99%','抢课失败','宿舍断网','校园跑没刷到',
    '体测挂了','保研失败','食堂没座位','奶茶洒了','电脑蓝屏','代码全删了','U盘丢了',
    '外卖送错了','快递被拿错','室友打呼噜'
  ],
  // 无限模式专属词库（50轮后解锁）
  infinite: [
    '时间','运气','希望','绝望','灵魂','信仰','哲学','宇宙','黑洞','平行世界',
    '程序员脱发','导师改论文','甲方第五次修改','开学前一天','假期最后一晚','手机没电','WiFi断网',
    '外卖撒了','室友打呼噜','领导开会','世界末日','中彩票','被窝封印','拖延症','选择困难症',
    '人生重开模拟器','空气突然安静','成年人崩溃瞬间','熬夜冠军','精神状态良好','表面淡定内心慌得一批',
    '早八','点名','迟到','旷课','请假','补课','签到','签退','抢课','挂科警告',
    '断电','断网','查寝','熄灯','开黑','追剧','外放视频','泡面','夜聊','通宵',
    '食堂涨价','饭菜难吃','手抖阿姨','窗口排队','免费汤','饭卡','食堂二楼','抢座位',
    '军训','教官','站军姿','齐步走','拉歌','汇演','校运会','迎新晚会','毕业晚会',
    '学生会','社团','竞选','招新','百团大战','志愿活动','校园歌手大赛','辅导员','班长','团支书',
    '代码','编程','Bug','修Bug','死循环','报错','调试','部署','宕机','熬夜改代码',
    '考试周','突击复习','临时抱佛脚','划重点','押题','背书','通宵','红牛','错题本','挂科边缘'
  ],
  // 一笔封神 - 简单可辨识的事物（100+词）
  oneStroke: [
    '苹果','月亮','蛇','河流','爱心','太阳','星星','闪电','雨伞','鱼',
    '猫','狗','鸡','鸭','鸟','蝴蝶','花朵','树叶','蘑菇','冰淇淋',
    '棒棒糖','气球','风筝','彩虹','山','桥','房子','船','飞机','汽车',
    '自行车','钟表','剪刀','钥匙','雨滴','雪花','火焰','音符','问号','感叹号',
    '对勾','叉号','箭头','螺旋','波浪线','锯齿线','虚线','圆圈','三角形','正方形',
    '蜗牛','兔子','熊','猪','蛇','青蛙','企鹅','海豚','鲸鱼','鲨鱼',
    '西瓜','香蕉','葡萄','草莓','樱桃','芒果','柠檬','椰子','桃子','橙子',
    '蛋糕','披萨','汉堡','薯条','可乐','咖啡','冰淇淋','甜甜圈','棒棒糖','爆米花',
    '灯泡','锁','铅笔','书','信封','邮票','旗帜','路标','红绿灯','方向盘',
    '吉他','钢琴','鼓','小提琴','喇叭','话筒','地球仪','沙漏','望远镜','指南针'
  ],
  // 隐形墨水 - 快速能画的事物（100+词）
  ink: [
    '笑脸','哭脸','生气','惊讶','爱心','星星','皇冠','眼镜','胡子','嘴巴',
    '鼻子','耳朵','手','脚','头发','帽子','领带','戒指','手表','包包',
    '苹果','香蕉','西瓜','葡萄','草莓','蛋糕','冰淇淋','披萨','汉堡','薯条',
    '猫','狗','兔子','熊','猪','鱼','蛇','鸟','蝴蝶','蜗牛',
    '房子','树','花','太阳','月亮','云','雨','雪','风','闪电',
    '雨伞','钥匙','铅笔','剪刀','尺子','橡皮','书包','水杯','手机','电脑',
    '篮球','足球','排球','乒乓球','羽毛球','网球','跳绳','滑板','头盔','拳击手套',
    '汽车','公交车','火车','飞机','轮船','自行车','摩托车','地铁','出租车','直升机',
    '老师','医生','警察','消防员','厨师','司机','歌手','画家','运动员','科学家',
    '开心','难过','愤怒','害怕','惊讶','爱心','笑脸','哭脸','OK','耶'
  ],
  // 反义词挑战 - 100+词
  antonym: [
    { word: '白天', hint: '不是晚上' }, { word: '黑夜', hint: '不是白天' },
    { word: '火', hint: '完全不冷' }, { word: '冰', hint: '绝对不热' },
    { word: '快', hint: '完全不慢' }, { word: '慢', hint: '绝对不快' },
    { word: '大', hint: '完全不小' }, { word: '小', hint: '绝对不大' },
    { word: '多', hint: '完全不少' }, { word: '少', hint: '绝对不多' },
    { word: '长', hint: '完全不短' }, { word: '短', hint: '绝对不长' },
    { word: '宽', hint: '完全不窄' }, { word: '窄', hint: '绝对不宽' },
    { word: '硬', hint: '完全不软' }, { word: '软', hint: '绝对不硬' },
    { word: '亮', hint: '完全不暗' }, { word: '暗', hint: '绝对不亮' },
    { word: '干', hint: '完全不湿' }, { word: '湿', hint: '绝对不干' },
    { word: '新', hint: '完全不旧' }, { word: '旧', hint: '绝对不新' },
    { word: '干净', hint: '完全不脏' }, { word: '脏', hint: '绝对不干净' },
    { word: '开心', hint: '完全不难过' }, { word: '难过', hint: '绝对不开心' },
    { word: '勇敢', hint: '完全不害怕' }, { word: '害怕', hint: '绝对不勇敢' },
    { word: '聪明', hint: '完全不笨' }, { word: '笨', hint: '绝对不聪明' },
    { word: '善良', hint: '完全不坏' }, { word: '坏', hint: '绝对不善良' },
    { word: '安静', hint: '完全不吵' }, { word: '吵闹', hint: '绝对不安静' },
    { word: '轻', hint: '完全不重' }, { word: '重', hint: '绝对不轻' },
    { word: '深', hint: '完全不浅' }, { word: '浅', hint: '绝对不深' },
    { word: '紧', hint: '完全不松' }, { word: '松', hint: '绝对不紧' },
    { word: '圆', hint: '完全不方' }, { word: '方', hint: '绝对不圆' },
    { word: '厚', hint: '完全不薄' }, { word: '薄', hint: '绝对不厚' },
    { word: '满', hint: '完全不空' }, { word: '空', hint: '绝对不满' },
    { word: '直', hint: '完全不弯' }, { word: '弯', hint: '绝对不直' },
    { word: '正', hint: '完全不歪' }, { word: '歪', hint: '绝对不正' },
    { word: '浓', hint: '完全不淡' }, { word: '淡', hint: '绝对不浓' },
    { word: '密', hint: '完全不稀' }, { word: '稀', hint: '绝对不密' },
    { word: '光滑', hint: '完全不粗糙' }, { word: '粗糙', hint: '绝对不光滑' },
    { word: '平坦', hint: '完全不崎岖' }, { word: '崎岖', hint: '绝对不平坦' },
    { word: '诚实', hint: '完全不撒谎' }, { word: '撒谎', hint: '绝对不诚实' },
    { word: '开始', hint: '完全没结束' }, { word: '结束', hint: '完全没开始' },
    { word: '成功', hint: '完全没失败' }, { word: '失败', hint: '完全没成功' },
    { word: '上升', hint: '完全没下降' }, { word: '下降', hint: '完全没上升' },
    { word: '打开', hint: '完全没关上' }, { word: '关上', hint: '完全没打开' },
    { word: '太阳', hint: '完全不是月亮' }, { word: '月亮', hint: '完全不是太阳' },
    { word: '海洋', hint: '完全不是陆地' }, { word: '陆地', hint: '完全不是海洋' },
    { word: '入口', hint: '完全不是出口' }, { word: '出口', hint: '完全不是入口' },
    { word: '老师', hint: '完全不是学生' }, { word: '学生', hint: '完全不是老师' },
    { word: '医生', hint: '完全不是病人' }, { word: '病人', hint: '完全不是医生' },
    { word: '老板', hint: '完全不是员工' }, { word: '员工', hint: '完全不是老板' },
    { word: '胖子', hint: '特别不瘦' }, { word: '瘦子', hint: '特别不胖' },
    { word: '老人', hint: '绝对不年轻' }, { word: '小孩', hint: '完全不老' },
    { word: '夏天', hint: '一点也不冷' }, { word: '冬天', hint: '完全不热' },
    { word: '山峰', hint: '完全不是山谷' }, { word: '山谷', hint: '完全不是山峰' },
    { word: '优点', hint: '完全不是缺点' }, { word: '缺点', hint: '完全不是优点' },
    { word: '穷人', hint: '一点不富' }, { word: '富人', hint: '一点不穷' },
    { word: '高个子', hint: '完全不矮' }, { word: '矮个子', hint: '完全不高' },
    { word: '天堂', hint: '完全不是地狱' }, { word: '地狱', hint: '完全不是天堂' },
    { word: '出生', hint: '完全没死亡' }, { word: '死亡', hint: '完全没出生' },
    { word: '提问', hint: '完全不是回答' }, { word: '回答', hint: '完全不是提问' },
    { word: '买入', hint: '完全没卖出' }, { word: '卖出', hint: '完全没买入' },
    { word: '优点', hint: '完全不是缺点' }, { word: '缺点', hint: '完全不是优点' },
    { word: '南方', hint: '完全不是北方' }, { word: '北方', hint: '完全不是南方' },
    { word: '东方', hint: '完全不是西方' }, { word: '西方', hint: '完全不是东方' },
    { word: '春天', hint: '完全不是秋天' }, { word: '秋天', hint: '完全不是春天' },
    { word: '黎明', hint: '完全不是黄昏' }, { word: '黄昏', hint: '完全不是黎明' },
    { word: '涨', hint: '完全没跌' }, { word: '跌', hint: '完全没涨' },
    { word: '加', hint: '完全没减' }, { word: '减', hint: '完全没加' },
    { word: '赢', hint: '完全没输' }, { word: '输', hint: '完全没赢' },
    { word: '买', hint: '完全没卖' }, { word: '卖', hint: '完全没买' },
    { word: '来', hint: '完全没去' }, { word: '去', hint: '完全没来' },
    { word: '笑', hint: '完全不哭' }, { word: '哭', hint: '完全不笑' }
  ],
  // 相反画法 - 需要画相反事物的词
  // 相反画法 - 100+词
  oppositeDraw: [
    { word: '太阳', draw: '月亮' }, { word: '火', draw: '冰' },
    { word: '白天', draw: '黑夜' }, { word: '夏天', draw: '冬天' },
    { word: '高山', draw: '深谷' }, { word: '大树', draw: '小草' },
    { word: '胖', draw: '瘦' }, { word: '高', draw: '矮' },
    { word: '快', draw: '慢' }, { word: '哭', draw: '笑' },
    { word: '开心', draw: '难过' }, { word: '勇敢', draw: '害怕' },
    { word: '干净', draw: '脏' }, { word: '新', draw: '旧' },
    { word: '打开', draw: '关上' }, { word: '开始', draw: '结束' },
    { word: '上升', draw: '下降' }, { word: '入口', draw: '出口' },
    { word: '海洋', draw: '沙漠' }, { word: '城市', draw: '乡村' },
    { word: '满', draw: '空' }, { word: '硬', draw: '软' },
    { word: '亮', draw: '暗' }, { word: '干', draw: '湿' },
    { word: '紧', draw: '松' }, { word: '大', draw: '小' },
    { word: '长', draw: '短' }, { word: '宽', draw: '窄' },
    { word: '深', draw: '浅' }, { word: '浓', draw: '淡' },
    { word: '密', draw: '稀' }, { word: '直', draw: '弯' },
    { word: '圆', draw: '方' }, { word: '厚', draw: '薄' },
    { word: '正', draw: '歪' }, { word: '轻', draw: '重' },
    { word: '多', draw: '少' }, { word: '安静', draw: '吵闹' },
    { word: '光滑', draw: '粗糙' }, { word: '平坦', draw: '崎岖' },
    { word: '聪明', draw: '笨' }, { word: '善良', draw: '坏' },
    { word: '诚实', draw: '撒谎' }, { word: '成功', draw: '失败' },
    { word: '出生', draw: '死亡' }, { word: '涨', draw: '跌' },
    { word: '加', draw: '减' }, { word: '赢', draw: '输' },
    { word: '买', draw: '卖' }, { word: '来', draw: '去' },
    { word: '笑', draw: '哭' }, { word: '春天', draw: '秋天' },
    { word: '黎明', draw: '黄昏' }, { word: '南方', draw: '北方' },
    { word: '东方', draw: '西方' }, { word: '天堂', draw: '地狱' },
    { word: '山峰', draw: '山谷' }, { word: '海洋', draw: '陆地' },
    { word: '太阳', draw: '星星' }, { word: '白天', draw: '月亮' },
    { word: '火焰', draw: '雪花' }, { word: '闪电', draw: '彩虹' },
    { word: '大雨', draw: '晴天' }, { word: '暴风', draw: '微风' },
    { word: '满月', draw: '新月' }, { word: '日出', draw: '日落' },
    { word: '涨潮', draw: '退潮' }, { word: '花开', draw: '花落' },
    { word: '发芽', draw: '落叶' }, { word: '黎明', draw: '深夜' },
    { word: '起飞', draw: '降落' }, { word: '出发', draw: '到达' },
    { word: '组装', draw: '拆卸' }, { word: '建造', draw: '拆除' },
    { word: '连接', draw: '断开' }, { word: '合并', draw: '分开' },
    { word: '聚集', draw: '分散' }, { word: '上升', draw: '下沉' },
    { word: '前进', draw: '后退' }, { word: '左转', draw: '右转' },
    { word: '向上', draw: '向下' }, { word: '向内', draw: '向外' },
    { word: '放大', draw: '缩小' }, { word: '变亮', draw: '变暗' },
    { word: '变热', draw: '变冷' }, { word: '变快', draw: '变慢' },
    { word: '变硬', draw: '变软' }, { word: '变干', draw: '变湿' },
    { word: '变新', draw: '变旧' }, { word: '变干净', draw: '变脏' },
    { word: '变满', draw: '变空' }, { word: '变紧', draw: '变松' },
    { word: '变直', draw: '变弯' }, { word: '变圆', draw: '变方' },
    { word: '变厚', draw: '变薄' }, { word: '变正', draw: '变歪' },
    { word: '变密', draw: '变稀' }, { word: '变浓', draw: '变淡' },
    { word: '变深', draw: '变浅' }, { word: '变宽', draw: '变窄' },
    { word: '变长', draw: '变短' }, { word: '变多', draw: '变少' }
  ],
  // 反向提示 - 100+词
  trickHint: [
    { word: '飞机', hint: '它不会飞' }, { word: '汽车', hint: '它不用轮子' },
    { word: '鱼', hint: '它不会游泳' }, { word: '鸟', hint: '它不会飞' },
    { word: '太阳', hint: '它是冷的' }, { word: '冰', hint: '它是热的' },
    { word: '猫', hint: '它会汪汪叫' }, { word: '狗', hint: '它会喵喵叫' },
    { word: '苹果', hint: '它是蔬菜' }, { word: '西瓜', hint: '它很小' },
    { word: '大象', hint: '它很小' }, { word: '蚂蚁', hint: '它很大' },
    { word: '长颈鹿', hint: '它脖子很短' }, { word: '蛇', hint: '它有很多脚' },
    { word: '蜘蛛', hint: '它只有2条腿' }, { word: '篮球', hint: '它是方形的' },
    { word: '筷子', hint: '它是圆的' }, { word: '镜子', hint: '它是黑色的' },
    { word: '雪人', hint: '它是热的' }, { word: '火焰', hint: '它是冷的' },
    { word: '钟表', hint: '它不走' }, { word: '灯泡', hint: '它是黑的' },
    { word: '铅笔', hint: '它不能写字' }, { word: '雨伞', hint: '它不能挡雨' },
    { word: '书', hint: '它没有字' }, { word: '鞋子', hint: '它不能穿' },
    { word: '帽子', hint: '它不能戴' }, { word: '手套', hint: '它不能戴' },
    { word: '袜子', hint: '它不能穿' }, { word: '裤子', hint: '它不能穿' },
    { word: '桌子', hint: '它不能坐' }, { word: '椅子', hint: '它不能躺' },
    { word: '床', hint: '它不能坐' }, { word: '门', hint: '它不能开' },
    { word: '窗户', hint: '它不能关' }, { word: '墙', hint: '它是软的' },
    { word: '地板', hint: '它是硬的' }, { word: '天花板', hint: '它在地下' },
    { word: '楼梯', hint: '它是平的' }, { word: '电梯', hint: '它不能动' },
    { word: '电话', hint: '它不能打' }, { word: '电视', hint: '它不能看' },
    { word: '电脑', hint: '它不能用' }, { word: '收音机', hint: '它不能听' },
    { word: '钢琴', hint: '它不能弹' }, { word: '吉他', hint: '它不能弹' },
    { word: '鼓', hint: '它不能敲' }, { word: '喇叭', hint: '它不能吹' },
    { word: '画笔', hint: '它不能画' }, { word: '橡皮', hint: '它不能擦' },
    { word: '尺子', hint: '它不能量' }, { word: '剪刀', hint: '它不能剪' },
    { word: '胶水', hint: '它不能粘' }, { word: '钉子', hint: '它不能钉' },
    { word: '锤子', hint: '它不能敲' }, { word: '螺丝刀', hint: '它不能拧' },
    { word: '扳手', hint: '它不能拧' }, { word: '钥匙', hint: '它不能开锁' },
    { word: '锁', hint: '它不能锁' }, { word: '钱包', hint: '它不能装钱' },
    { word: '背包', hint: '它不能装东西' }, { word: '行李箱', hint: '它不能装东西' },
    { word: '冰箱', hint: '它是热的' }, { word: '空调', hint: '它不能制冷' },
    { word: '风扇', hint: '它不能吹风' }, { word: '烤箱', hint: '它是冷的' },
    { word: '微波炉', hint: '它不能加热' }, { word: '洗衣机', hint: '它不能洗' },
    { word: '吸尘器', hint: '它不能吸' }, { word: '吹风机', hint: '它不能吹' },
    { word: '牙刷', hint: '它不能刷' }, { word: '牙膏', hint: '它不能挤' },
    { word: '毛巾', hint: '它不能擦' }, { word: '肥皂', hint: '它不能洗' },
    { word: '洗发水', hint: '它不能洗头' }, { word: '沐浴露', hint: '它不能洗澡' },
    { word: '蜡烛', hint: '它不能点亮' }, { word: '打火机', hint: '它不能点火' },
    { word: '火柴', hint: '它不能点火' }, { word: '烟花', hint: '它不能放' },
    { word: '鞭炮', hint: '它不能响' }, { word: '气球', hint: '它不能飞' },
    { word: '风筝', hint: '它不能飞' }, { word: '降落伞', hint: '它不能降落' },
    { word: '火箭', hint: '它不能飞' }, { word: '潜水艇', hint: '它不能潜水' },
    { word: '坦克', hint: '它不能打仗' }, { word: '大炮', hint: '它不能开火' },
    { word: '弓箭', hint: '它不能射' }, { word: '盾牌', hint: '它不能防' },
    { word: '宝剑', hint: '它不能砍' }, { word: '斧头', hint: '它不能砍' },
    { word: '镰刀', hint: '它不能割' }, { word: '锄头', hint: '它不能挖' },
    { word: '铁锹', hint: '它不能铲' }, { word: '扫帚', hint: '它不能扫' },
    { word: '拖把', hint: '它不能拖' }, { word: '抹布', hint: '它不能擦' }
  ],
  // Boss关 - 混合词库
  boss: [
    '苹果','飞机','篮球','猫','太阳','雨伞','汽车','西瓜','眼镜','钥匙',
    '老师','医生','消防员','厨师','宇航员','程序员','歌手','画家','运动员','科学家',
    '学校','医院','超市','电影院','机场','图书馆','游乐园','动物园','博物馆','公园',
    '考试','毕业','论文','答辩','军训','迟到','早八','查寝','自习','抢课',
    '开心','难过','梦想','自由','爱情','勇气','孤独','希望','坚持','成长'
  ]
};

// ===== 关卡配置 =====
const LEVEL_CONFIG = [
  { id: 1,  name: '新手画师',   time: 90,  wordPool: 'easy',         hints: true,  strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: null, desc: '90秒 · 有提示 · 教学关' },
  { id: 2,  name: '灵魂画手',   time: 75,  wordPool: 'medium',       hints: true,  strokeLimit: null, wrongPenalty: { count: 5, secs: 5 }, canvasHidden: false, mechanics: null, desc: '75秒 · 连错扣时' },
  { id: 3,  name: '极速挑战',   time: 45,  wordPool: 'hard',         hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: null, desc: '45秒 · 无提示' },
  { id: 4,  name: '三笔大师',   time: 60,  wordPool: 'expert',       hints: false, strokeLimit: 3,   wrongPenalty: null,                canvasHidden: false, mechanics: null, desc: '60秒 · 最多3笔' },
  { id: 5,  name: '盲画危机',   time: 60,  wordPool: 'hard2',        hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: true,  mechanics: null, desc: '60秒 · 看不到画布' },
  { id: 6,  name: '一笔封神',   time: 60,  wordPool: 'oneStroke',    hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { oneStroke: true }, desc: '60秒 · 只能画一笔' },
  { id: 7,  name: '隐形墨水',   time: 75,  wordPool: 'ink',          hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { inkFade: 3 }, desc: '75秒 · 笔画3秒消失' },
  { id: 8,  name: '越来越粗',   time: 60,  wordPool: 'easy',         hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { brushGrow: true }, desc: '60秒 · 笔刷自动变粗' },
  { id: 9,  name: '越来越细',   time: 60,  wordPool: 'easy',         hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { brushShrink: true }, desc: '60秒 · 笔刷自动变细' },
  { id: 10, name: '倒计时爆炸', time: 60,  wordPool: 'easy',         hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { autoClear: 10 }, desc: '60秒 · 每10秒清空画布' },
  { id: 11, name: '画布旋转',   time: 75,  wordPool: 'easy',         hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { canvasRotate: 5 }, desc: '75秒 · 画布每5秒旋转' },
  { id: 12, name: '反向提示',   time: 75,  wordPool: 'trickHint',    hints: true,  strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { trickHints: true }, desc: '75秒 · 提示是假的' },
  { id: 13, name: '只能画不能说', time: 60, wordPool: 'easy',         hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { muteVoice: true }, desc: '60秒 · 关闭语音' },
  { id: 14, name: '反义词挑战', time: 75,  wordPool: 'antonym',       hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { antonym: true }, desc: '75秒 · 只能说反义描述' },
  { id: 15, name: '相反画法',   time: 60,  wordPool: 'oppositeDraw', hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { oppositeDraw: true }, desc: '60秒 · 画相反的东西' },
  { id: 16, name: '抽象大师',   time: 90,  wordPool: 'abstract',      hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { abstractMode: true }, desc: '90秒 · 语音为主' },
  { id: 17, name: '幸运轮盘',   time: 60,  wordPool: 'easy',         hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { wheel: true }, desc: '60秒 · 随机负面BUFF' },
  { id: 18, name: '史诗Boss关', time: 180, wordPool: 'boss',         hints: false, strokeLimit: null, wrongPenalty: null,                canvasHidden: false, mechanics: { boss: 10 }, desc: '180秒 · 连战10词' },
];

// ===== 评级配置 =====
const GRADE_THRESHOLDS = [
  { grade: 'SSS', minAccuracy: 0.95, minStreak: 15, label: '无需语言',      message: '你们已经不需要说话了。' },
  { grade: 'SS',  minAccuracy: 0.90, minStreak: 10, label: '双人成神',      message: '默契度突破天际！' },
  { grade: 'S',   minAccuracy: 0.85, minStreak: 7,  label: '灵魂共鸣',      message: '心有灵犀一点通！' },
  { grade: 'A',   minAccuracy: 0.75, minStreak: 5,  label: '心有灵犀',      message: '你们的默契令人羡慕！' },
  { grade: 'B',   minAccuracy: 0.60, minStreak: 3,  label: '默契搭档',      message: '配合越来越好了！' },
  { grade: 'C',   minAccuracy: 0.40, minStreak: 0,  label: '普通朋友',      message: '还需要更多磨合。' },
  { grade: 'D',   minAccuracy: 0,    minStreak: 0,  label: '初识阶段',      message: '默契之路才刚开始。' },
];

function getRandomWord(difficulty) {
  const bank = WORD_BANKS[difficulty] || WORD_BANKS.easy;
  return bank[Math.floor(Math.random() * bank.length)];
}

function getWordForLevel(level, round) {
  // Campaign: use level's word pool
  if (level >= 1 && level <= 5) {
    const config = LEVEL_CONFIG[level - 1];
    return getRandomWord(config.wordPool);
  }
  // Infinite: difficulty scales with rounds
  if (round <= 10) return getRandomWord('easy');
  if (round <= 20) return getRandomWord('medium');
  if (round <= 40) return getRandomWord('hard');
  return getRandomWord('abstract');
}

function calculateGrade(stats) {
  const accuracy = stats.totalRounds > 0 ? stats.correctGuesses / stats.totalRounds : 0;
  const streak = stats.maxStreak;
  for (const g of GRADE_THRESHOLDS) {
    if (accuracy >= g.minAccuracy && streak >= g.minStreak) return g;
  }
  return GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1];
}

function send(ws, data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

// ===== 游戏主类 =====
class DrawGuessGame {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = new Map(); // ws → { id, ready }
    this.phase = 'waiting';   // waiting | countdown | playing | level_complete | game_over
    this.mode = 'campaign';   // campaign | infinite
    this.level = 1;
    this.round = 0;
    this.totalRounds = 0;
    this.drawerWs = null;
    this.guesserWs = null;
    this.targetWord = '';
    this.strokes = [];
    this.strokeCount = 0;
    this.timer = 0;
    this.timerInterval = null;
    this.score = {
      total: 0,
      streak: 0,
      maxStreak: 0,
      correctGuesses: 0,
      totalRounds: 0,
      totalTime: 0,
      startTime: 0
    };
    this.guessLogs = [];
    this.wrongGuessCount = 0;
    this.canvasHidden = false;
    this.countdownTimer = null;
    this._usedWords = new Set();
    // Boss关状态
    this.bossWords = [];
    this.bossIndex = 0;
  }

  addPlayer(ws, playerId) {
    if (this.players.size >= 2) return false;
    this.players.set(ws, { id: playerId, ready: false });
    return true;
  }

  removePlayer(ws) {
    this.players.delete(ws);
    this.cleanup();
    return this.players.size;
  }

  toggleReady(ws) {
    const p = this.players.get(ws);
    if (!p) return null;
    p.ready = !p.ready;
    return p.ready;
  }

  bothReady() {
    if (this.players.size !== 2) return false;
    for (const [, p] of this.players) {
      if (!p.ready) return false;
    }
    return true;
  }

  getOtherPlayer(ws) {
    for (const [otherWs] of this.players) {
      if (otherWs !== ws) return otherWs;
    }
    return null;
  }

  getPlayerInfo(ws) {
    return this.players.get(ws);
  }

  startGame(mode) {
    this.mode = mode;
    this.level = 1;
    this.round = 0;
    this.totalRounds = 0;
    this.score = {
      total: 0, streak: 0, maxStreak: 0,
      correctGuesses: 0, totalRounds: 0,
      totalTime: 0, startTime: Date.now()
    };
    this.guessLogs = [];
    this._usedWords = new Set();

    // Assign roles: first player draws first
    const wsList = [...this.players.keys()];
    this.drawerWs = wsList[0];
    this.guesserWs = wsList[1];

    this._startCountdown();
  }

  _startCountdown() {
    this.phase = 'countdown';
    let count = 3;

    // Send countdown to both players
    for (const [ws] of this.players) {
      send(ws, { type: 'countdown', number: count });
    }

    this.countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        for (const [ws] of this.players) {
          send(ws, { type: 'countdown', number: count });
        }
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this._startRound();
      }
    }, 1000);
  }

  _startRound() {
    this.phase = 'playing';
    this.round++;
    this.totalRounds++;
    this.score.totalRounds = this.totalRounds;
    this.strokes = [];
    this.strokeCount = 0;
    this.wrongGuessCount = 0;

    let config = null;
    let wordData = null;

    // Pick word
    if (this.mode === 'campaign') {
      config = LEVEL_CONFIG[this.level - 1];
      this.timer = config.time;
      this.canvasHidden = config.canvasHidden;
      // Boss关：一次性选10个词
      if (config.mechanics && config.mechanics.boss) {
        this.bossWords = [];
        for (let i = 0; i < config.mechanics.boss; i++) {
          this.bossWords.push(this._pickUniqueWord(config.wordPool));
        }
        this.bossIndex = 0;
        wordData = this.bossWords[0];
      } else {
        this.bossWords = [];
        this.bossIndex = 0;
        wordData = this._pickUniqueWord(config.wordPool);
      }
    } else {
      // Infinite mode: timer starts at 300, +20 on correct
      if (this.round === 1) this.timer = 300;
      this.canvasHidden = false;
      // 从所有关卡词库中随机选一个池子
      const allPools = ['easy','medium','hard','expert','hard2','oneStroke','ink','infinite'];
      const pool = allPools[Math.floor(Math.random() * allPools.length)];
      wordData = this._pickUniqueWord(pool);
    }

    // 处理特殊词库格式（对象包含 word + hint/draw 等）
    let word, extra;
    if (typeof wordData === 'object' && wordData !== null) {
      word = wordData.word;
      extra = {};
      if (wordData.hint) extra.hint = wordData.hint;
      if (wordData.draw) extra.draw = wordData.draw;
    } else {
      word = wordData;
      extra = null;
    }
    this.targetWord = word;

    const drawerId = this.players.get(this.drawerWs)?.id;
    const guesserId = this.players.get(this.guesserWs)?.id;
    const mechanics = config ? config.mechanics : null;

    // 构建 round_start 消息
    const baseMsg = {
      round: this.totalRounds,
      level: this.level,
      mode: this.mode,
      time: this.timer,
      drawerId, guesserId,
      mechanics: mechanics,
      bossProgress: this.bossWords.length > 0 ? { current: this.bossIndex + 1, total: this.bossWords.length } : null
    };

    // Send round start to drawer (with word + extra info)
    send(this.drawerWs, {
      ...baseMsg,
      type: 'round_start',
      role: 'drawer',
      word: word,
      extra: extra,
      canvasHidden: this.canvasHidden,
      strokeLimit: config ? config.strokeLimit : null,
      hintsAllowed: config ? config.hints : false,
    });

    // Send round start to guesser (without word, but with mechanics + extra hint info)
    send(this.guesserWs, {
      ...baseMsg,
      type: 'round_start',
      role: 'guesser',
      word: null,
      // 反义词/反向提示关卡：给猜词者也发送提示信息
      extra: (mechanics && (mechanics.antonym || mechanics.trickHints) && extra) ? extra : null,
      canvasHidden: false,
      strokeLimit: null,
      hintsAllowed: config ? config.hints : false,
    });

    // Start timer
    this._startTimer();
  }

  _pickUniqueWord(difficulty) {
    const bank = WORD_BANKS[difficulty] || WORD_BANKS.easy;
    const getKey = (w) => typeof w === 'string' ? w : w.word;
    // 过滤掉本房间已使用过的词（跨关卡去重）
    const available = bank.filter(w => !this._usedWords.has(getKey(w)));
    if (available.length === 0) {
      // 该词库全部用完，允许重复
      return bank[Math.floor(Math.random() * bank.length)];
    }
    const word = available[Math.floor(Math.random() * available.length)];
    this._usedWords.add(getKey(word));
    return word;
  }

  _startTimer() {
    this._stopTimer();
    this.timerInterval = setInterval(() => {
      this.timer--;
      // Broadcast timer to both players
      for (const [ws] of this.players) {
        send(ws, { type: 'timer_tick', time: this.timer });
      }
      if (this.timer <= 0) {
        this._onTimeUp();
      }
    }, 1000);
  }

  _stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  _onTimeUp() {
    this._stopTimer();
    this.score.streak = 0;

    // Log the missed word
    this.guessLogs.push({
      target: this.targetWord,
      guess: '(超时)',
      time: this.mode === 'campaign' ? LEVEL_CONFIG[this.level - 1].time : 300
    });

    if (this.mode === 'campaign') {
      // Campaign: level failed
      this.phase = 'game_over';
      const grade = calculateGrade(this.score);
      for (const [ws] of this.players) {
        send(ws, {
          type: 'game_over',
          stats: this._getStats(),
          grade,
          guessLogs: this.guessLogs
        });
      }
    } else {
      // Infinite: game over
      this.phase = 'game_over';
      this.score.totalTime = Math.floor((Date.now() - this.score.startTime) / 1000);
      const grade = calculateGrade(this.score);
      for (const [ws] of this.players) {
        send(ws, {
          type: 'game_over',
          stats: this._getStats(),
          grade,
          guessLogs: this.guessLogs
        });
      }
    }
  }

  addStroke(ws, strokeData) {
    if (this.phase !== 'playing') return false;
    if (ws !== this.drawerWs) return false;

    const config = this.mode === 'campaign' ? LEVEL_CONFIG[this.level - 1] : null;
    if (config && config.strokeLimit && strokeData.type === 'start') {
      if (this.strokeCount >= config.strokeLimit) return false;
      this.strokeCount++;
    }

    this.strokes.push({ ...strokeData, playerId: this.players.get(ws)?.id });

    // Broadcast to guesser
    const otherWs = this.getOtherPlayer(ws);
    const { type: _, ...rest } = strokeData;
    send(otherWs, { type: 'draw_' + strokeData.type, ...rest });

    return true;
  }

  clearCanvas(ws) {
    if (this.phase !== 'playing') return false;
    if (ws !== this.drawerWs) return false;
    this.strokes = [];
    this.strokeCount = 0;
    const otherWs = this.getOtherPlayer(ws);
    send(otherWs, { type: 'draw_clear' });
    return true;
  }

  undoStroke(ws) {
    if (this.phase !== 'playing') return false;
    if (ws !== this.drawerWs) return false;
    if (this.strokes.length === 0) return false;

    // Remove last stroke
    this.strokes.pop();
    this.strokeCount = Math.max(0, this.strokeCount - 1);

    const otherWs = this.getOtherPlayer(ws);
    send(otherWs, { type: 'draw_undo' });
    return true;
  }

  submitGuess(ws, guessText) {
    if (this.phase !== 'playing') return null;
    if (ws !== this.guesserWs) return null;

    const guess = guessText.trim();
    if (!guess) return null;

    const correct = guess === this.targetWord;

    if (correct) {
      // Correct guess!
      this.score.correctGuesses++;
      this.score.streak++;
      if (this.score.streak > this.score.maxStreak) {
        this.score.maxStreak = this.score.streak;
      }

      // Score: base + time bonus + streak bonus
      const timeBonus = Math.floor(this.timer / 2);
      const streakBonus = Math.min(this.score.streak * 5, 50);
      const roundScore = 100 + timeBonus + streakBonus;
      this.score.total += roundScore;

      this.guessLogs.push({
        target: this.targetWord,
        guess: guess,
        correct: true
      });

      // Notify both players
      for (const [pws] of this.players) {
        send(pws, {
          type: 'guess_result',
          correct: true,
          guess,
          word: this.targetWord,
          score: roundScore,
          streak: this.score.streak
        });
      }

      this._stopTimer();

      if (this.mode === 'campaign') {
        // Boss关：最后一个词猜完 → 过关
        if (this.bossWords.length > 0 && this.bossIndex >= this.bossWords.length - 1) {
          this._onLevelComplete();
        } else if (this.bossWords.length > 0 && this.bossIndex < this.bossWords.length - 1) {
          this.bossIndex++;
          this.targetWord = this.bossWords[this.bossIndex];
          this.strokes = [];
          this.strokeCount = 0;
          this.wrongGuessCount = 0;
          this._swapRoles();
          // 用 round_start 消息格式，复用客户端 onRoundStart 处理逻辑
          const drawerId = this.players.get(this.drawerWs)?.id;
          const guesserId = this.players.get(this.guesserWs)?.id;
          const config = LEVEL_CONFIG[this.level - 1];
          send(this.drawerWs, {
            type: 'round_start', round: this.totalRounds,
            level: this.level, mode: this.mode, role: 'drawer',
            word: this.targetWord, time: this.timer,
            canvasHidden: false, strokeLimit: null,
            hintsAllowed: false, mechanics: config.mechanics,
            drawerId, guesserId,
            bossProgress: { current: this.bossIndex + 1, total: this.bossWords.length }
          });
          send(this.guesserWs, {
            type: 'round_start', round: this.totalRounds,
            level: this.level, mode: this.mode, role: 'guesser',
            word: null, time: this.timer,
            canvasHidden: false, strokeLimit: null,
            hintsAllowed: false, mechanics: config.mechanics,
            drawerId, guesserId,
            bossProgress: { current: this.bossIndex + 1, total: this.bossWords.length }
          });
          this._startTimer();
        } else if (this.totalRounds % 5 === 0) {
          this._onLevelComplete();
        } else {
          this._swapRoles();
          setTimeout(() => this._startRound(), 2000);
        }
      } else {
        // Infinite: add time and swap roles
        this.timer += 20;
        this._swapRoles();
        setTimeout(() => this._startRound(), 2000);
      }

      return { correct: true, score: roundScore };
    } else {
      // Wrong guess
      this.wrongGuessCount++;
      this.score.streak = 0;

      this.guessLogs.push({
        target: this.targetWord,
        guess: guess,
        correct: false
      });

      // Check wrong penalty (level 2)
      let penalty = 0;
      if (this.mode === 'campaign') {
        const config = LEVEL_CONFIG[this.level - 1];
        if (config.wrongPenalty && this.wrongGuessCount % config.wrongPenalty.count === 0) {
          penalty = config.wrongPenalty.secs;
          this.timer = Math.max(0, this.timer - penalty);
        }
      }

      // Notify both players
      for (const [pws] of this.players) {
        send(pws, {
          type: 'guess_result',
          correct: false,
          guess,
          penalty,
          wrongCount: this.wrongGuessCount
        });
      }

      return { correct: false };
    }
  }

  getHint() {
    if (this.phase !== 'playing') return null;
    if (this.mode === 'campaign') {
      const config = LEVEL_CONFIG[this.level - 1];
      if (!config.hints) return null;
      // 反向提示关卡：返回误导性提示
      if (config.mechanics && config.mechanics.trickHints) {
        const bank = WORD_BANKS[config.wordPool];
        const entry = bank.find(w => (typeof w === 'object' ? w.word : w) === this.targetWord);
        if (entry && entry.hint) return { hint: entry.hint, length: this.targetWord.length, trick: true };
      }
    } else {
      return null;
    }

    const word = this.targetWord;
    const hint = word[0] + '_'.repeat(word.length - 1);
    return { hint, length: word.length };
  }

  _swapRoles() {
    const temp = this.drawerWs;
    this.drawerWs = this.guesserWs;
    this.guesserWs = temp;
  }

  _onLevelComplete() {
    this.phase = 'level_complete';

    const levelStats = {
      level: this.level,
      levelName: LEVEL_CONFIG[this.level - 1].name,
      score: this.score.total,
      streak: this.score.maxStreak,
      correctGuesses: this.score.correctGuesses,
      totalRounds: this.score.totalRounds
    };

    for (const [ws] of this.players) {
      send(ws, { type: 'level_complete', stats: levelStats });
    }
  }

  nextLevel() {
    this._stopTimer();
    if (this.mode === 'campaign') {
      if (this.level < LEVEL_CONFIG.length) {
        this.level++;
        this._startCountdown();
      } else {
        this.mode = 'infinite';
        this.round = 0;
        this._startCountdown();
      }
    }
  }

  startInfinite() {
    this.mode = 'infinite';
    this.level = 0;
    this.round = 0;
    this.totalRounds = 0;
    this.score = {
      total: 0, streak: 0, maxStreak: 0,
      correctGuesses: 0, totalRounds: 0,
      totalTime: 0, startTime: Date.now()
    };
    this.guessLogs = [];
    this._usedWords.clear();

    const wsList = [...this.players.keys()];
    this.drawerWs = wsList[0];
    this.guesserWs = wsList[1];

    this._startCountdown();
  }

  _getStats() {
    return {
      level: this.level,
      mode: this.mode,
      totalRounds: this.score.totalRounds,
      correctGuesses: this.score.correctGuesses,
      maxStreak: this.score.maxStreak,
      totalScore: this.score.total,
      totalTime: Math.floor((Date.now() - this.score.startTime) / 1000),
      accuracy: this.score.totalRounds > 0
        ? Math.round(this.score.correctGuesses / this.score.totalRounds * 100)
        : 0
    };
  }

  getState() {
    const drawerId = this.drawerWs ? this.players.get(this.drawerWs)?.id : null;
    const guesserId = this.guesserWs ? this.players.get(this.guesserWs)?.id : null;
    return {
      phase: this.phase,
      mode: this.mode,
      level: this.level,
      round: this.totalRounds,
      timer: this.timer,
      targetWord: this.phase === 'playing' ? this.targetWord : null,
      strokes: this.strokes,
      strokeCount: this.strokeCount,
      score: this.score,
      canvasHidden: this.canvasHidden,
      drawerId,
      guesserId,
      players: [...this.players.entries()].map(([ws, p]) => ({
        id: p.id,
        ready: p.ready,
        isDrawer: ws === this.drawerWs
      }))
    };
  }

  cleanup() {
    this._stopTimer();
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}

module.exports = { DrawGuessGame, WORD_BANKS, LEVEL_CONFIG, GRADE_THRESHOLDS };
