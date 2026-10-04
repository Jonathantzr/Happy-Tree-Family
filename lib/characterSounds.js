// lib/characterSounds.js
// "Type the sound, tap the character" — for people with no Chinese keyboard.
// One sound has many possible characters (zhi = 志 智 之 知 …), so the app can
// never know which one is right from the English spelling alone: it only
// lists the likely ones and a person picks.
//
// PINYIN: Mandarin spelling without tones -> characters often used in names.
// LOCAL: spellings common in Malaysia/Singapore that are NOT Mandarin
// (Hokkien, Cantonese, Teochew, Hakka… e.g. Tan = 陈, Boon = 文). These are
// best guesses — the same spelling can mean different characters in different
// families. Neither list is complete; add to them freely.

const PINYIN = {
  a: '阿', ai: '爱艾蔼', an: '安岸', ang: '昂', ao: '奥傲',
  ba: '八巴芭', bai: '白百柏', ban: '班半', bang: '邦帮', bao: '宝保包葆', bei: '北贝蓓倍', ben: '本奔',
  bi: '碧必毕璧', bian: '边卞', biao: '标彪表', bin: '斌彬滨宾', bing: '冰兵炳秉丙', bo: '波博伯柏渤', bu: '步布卜',
  cai: '才财彩蔡采', can: '灿璨', cang: '仓苍沧', cao: '曹草', ce: '策', cen: '岑',
  cha: '茶查', chai: '柴', chang: '昌长常畅', chao: '超朝潮', che: '车', chen: '陈晨辰臣琛宸',
  cheng: '成诚城程承澄', chi: '池驰赤', chong: '崇冲充', chu: '楚初储', chuan: '川传船', chuang: '创',
  chun: '春纯淳椿', ci: '慈赐', cong: '聪从丛', cui: '翠崔', cun: '存村',
  da: '大达', dai: '代岱戴黛', dan: '丹旦单', dang: '当', dao: '道稻', de: '德得', deng: '登邓灯',
  di: '迪弟帝狄', dian: '典殿', ding: '丁定鼎', dong: '东冬栋董', dou: '斗豆窦', du: '杜度都',
  duan: '端段', dun: '敦顿', duo: '多朵铎',
  e: '娥峨', en: '恩', er: '二尔儿',
  fa: '发法', fan: '凡帆范繁', fang: '方芳放房', fei: '飞菲非斐霏', fen: '芬分奋',
  feng: '丰峰风凤锋枫冯', fo: '佛', fu: '福富夫芙甫符傅辅复',
  gai: '改', gan: '甘敢干', gang: '刚钢港岗', gao: '高', ge: '歌格戈葛', gen: '根', geng: '耕耿庚',
  gong: '公功恭宫龚', gou: '苟', gu: '古谷顾固', guan: '关冠观官管', guang: '光广', gui: '贵桂归圭', guo: '国果郭',
  hai: '海', han: '汉涵翰韩寒含晗', hang: '航杭', hao: '浩豪昊好皓', he: '和合河何荷贺鹤禾赫', hei: '黑',
  heng: '恒衡亨', hong: '宏洪红鸿弘虹泓', hou: '厚侯后', hu: '虎胡湖', hua: '华花桦化', huai: '怀淮',
  huan: '欢环焕桓', huang: '黄煌皇', hui: '辉惠慧会晖卉蕙徽', huo: '火霍',
  ji: '吉基继纪季济机记集骥', jia: '家佳嘉加甲贾', jian: '建健坚剑见简鉴', jiang: '江将姜蒋', jiao: '娇教焦',
  jie: '杰洁捷节结介', jin: '金进锦晋今津瑾谨', jing: '静晶京敬景经精靖菁', jiong: '炯', jiu: '九久玖',
  ju: '菊举居巨聚', juan: '娟涓卷', jue: '觉珏决', jun: '军君俊骏钧峻均',
  kai: '凯开楷恺', kan: '侃堪', kang: '康抗', ke: '可克科柯珂', ken: '肯', kong: '孔空', kou: '寇',
  kuai: '快', kuan: '宽', kuang: '匡旷', kui: '奎魁葵', kun: '坤昆琨',
  lai: '来赖莱', lan: '兰岚蓝澜', lang: '朗郎浪琅', lao: '老劳', le: '乐', lei: '雷磊蕾', leng: '冷',
  li: '丽立力李利礼理黎莉里励俐', lian: '连莲廉联濂', liang: '良亮梁量', liao: '廖辽', lie: '烈列',
  lin: '林琳霖临麟邻', ling: '玲灵凌龄令铃岭菱', liu: '刘柳流六留', long: '龙隆珑', lou: '楼娄',
  lu: '陆路鲁露卢禄璐鹿', luan: '栾鸾', lun: '伦仑轮', luo: '罗洛骆', lv: '吕绿律旅',
  ma: '马玛', mai: '麦迈', man: '曼满蔓', mao: '茂毛', mei: '美梅媚玫眉妹', men: '门', meng: '梦孟萌蒙猛',
  mi: '米密蜜', mian: '绵勉', miao: '苗妙淼', min: '敏民闵旻珉', ming: '明名铭鸣茗', mo: '莫墨默', mu: '木牧慕穆沐',
  na: '娜纳', nai: '乃', nan: '南楠男', neng: '能', ni: '妮尼倪霓', nian: '年念', nie: '聂', ning: '宁凝',
  niu: '牛钮', nong: '农', nu: '努', nuo: '诺', nv: '女',
  ou: '欧鸥',
  pan: '潘盼攀', pang: '庞', pei: '培佩沛裴', peng: '朋鹏彭蓬', pi: '皮', pin: '品', ping: '平萍屏凭', po: '坡',
  pu: '普朴浦璞蒲',
  qi: '奇琪启其齐七祺琦旗麒', qian: '千前谦乾倩钱茜', qiang: '强', qiao: '巧乔桥侨', qin: '琴勤钦秦芹亲沁',
  qing: '清青庆晴卿情轻', qiong: '琼', qiu: '秋邱丘球裘', qu: '曲瞿屈', quan: '全泉权', que: '鹊', qun: '群',
  ran: '然冉染', rao: '饶', ren: '仁人任忍', ri: '日', rong: '荣容蓉融戎榕', rou: '柔', ru: '如儒茹汝',
  rui: '瑞睿锐蕊芮', run: '润', ruo: '若',
  sa: '萨', sai: '赛', san: '三', sang: '桑', sen: '森', sha: '沙莎', shan: '山善珊姗杉', shang: '尚上商',
  shao: '少绍邵韶', she: '社舍', shen: '深沈申神慎绅', sheng: '生胜盛圣声升笙', shi: '士世石诗时实施史仕师',
  shou: '寿守首', shu: '书树淑舒述殊姝', shuai: '帅', shuang: '双爽霜', shui: '水', shun: '顺舜', shuo: '硕朔',
  si: '思四斯司丝', song: '松宋颂嵩', su: '苏素肃', sui: '岁穗隋', sun: '孙', suo: '索',
  tai: '泰太台', tan: '谭坦檀潭谈', tang: '唐堂棠汤', tao: '涛桃陶韬', te: '特', teng: '腾藤滕', ti: '体提',
  tian: '天田甜恬添', tie: '铁', ting: '婷廷庭亭挺霆', tong: '同通彤童桐统', tu: '图涂', tuan: '团', tuo: '拓',
  wa: '娃', wai: '外', wan: '万婉晚宛琬', wang: '王旺望汪', wei: '伟威维卫为薇巍玮炜唯蔚魏韦',
  wen: '文雯温闻稳', weng: '翁', wo: '沃', wu: '武吴五伍务悟梧',
  xi: '希喜熙西溪惜锡曦玺禧', xia: '夏霞侠', xian: '先贤显仙宪娴献咸', xiang: '祥香翔向湘想相',
  xiao: '小晓孝笑萧肖霄潇', xie: '谢协', xin: '新心欣信鑫馨辛昕', xing: '星兴行幸杏邢', xiong: '雄熊', xiu: '秀修',
  xu: '许旭徐绪续虚煦', xuan: '轩宣萱璇玄选', xue: '学雪薛', xun: '勋训迅循',
  ya: '雅亚娅芽', yan: '燕艳言颜彦严炎延岩妍晏雁', yang: '阳洋杨扬仰养', yao: '耀瑶姚尧遥', ye: '叶业烨晔夜',
  yi: '一义怡仪艺益毅逸宜意亿依奕易乙', yin: '银音因茵尹寅殷', ying: '英颖盈莹瑛应迎影樱',
  yong: '永勇用雍咏庸', you: '友有佑优幼尤游悠', yu: '玉宇雨瑜育余裕于禹愉钰羽语毓',
  yuan: '元远园源圆苑媛袁渊', yue: '月越悦岳跃', yun: '云韵运芸允',
  zai: '再在载', zan: '赞', ze: '泽则择', zeng: '增曾', zhan: '展占战詹', zhang: '张章彰璋长',
  zhao: '照兆赵昭朝', zhe: '哲喆浙', zhen: '珍真振镇贞震臻祯', zheng: '正政征郑铮峥',
  zhi: '志智之知治芝直致质植至', zhong: '中忠仲钟众重', zhou: '周洲舟宙', zhu: '竹珠朱主祝柱筑',
  zhuang: '庄壮', zhuo: '卓', zi: '子紫梓资自', zong: '宗总', zu: '祖足', zuo: '左作佐',
};

const LOCAL = {
  // surnames
  tan: '陈', lim: '林', lee: '李', ng: '黄吴伍', ong: '王翁汪', wong: '黄王', chan: '陈', chin: '陈秦',
  chong: '张钟庄', cheong: '张', teo: '张', teoh: '张', tiong: '张忠', goh: '吴', yap: '叶', yeap: '叶', yip: '叶',
  low: '刘罗', lau: '刘', liew: '刘', lew: '刘', tay: '郑', teh: '郑', tee: '郑', cheah: '谢', chia: '谢', sia: '谢',
  chua: '蔡', chuah: '蔡', choy: '蔡', chai: '蔡', koh: '许', khor: '许', khoo: '邱', hew: '丘', ooi: '黄', wee: '黄',
  foo: '符胡', hoo: '胡', oh: '胡', woo: '胡吴', ho: '何', leong: '梁', neo: '梁', neoh: '梁', loh: '罗', loo: '卢',
  mah: '马', mak: '麦', yeoh: '杨', yeo: '杨', yong: '杨', chew: '周', chow: '周', sim: '沈', soh: '苏', soo: '苏', saw: '苏',
  see: '施', toh: '杜卓', kok: '郭国', kwok: '郭', quek: '郭', kuek: '郭', kuan: '关', kwan: '关', lam: '林蓝',
  seow: '萧', siew: '萧秀小', phua: '潘', poon: '潘', phang: '彭', pang: '彭', tham: '谭', thong: '汤唐', tong: '唐汤',
  tang: '邓', yee: '余仪怡', yew: '尤', choo: '朱', lok: '骆陆', loke: '陆', kong: '江', kang: '江', fong: '方冯',
  fung: '冯', ang: '洪', aw: '欧', au: '欧', wan: '温', voon: '温', heng: '王',
  // given names
  boon: '文', beng: '明', chee: '志智', choon: '春俊', chun: '俊', chye: '财', eng: '英荣', hock: '福', fook: '福',
  hooi: '辉惠', huat: '发', fatt: '发', kah: '嘉家', keat: '吉杰', kiat: '吉杰', kit: '杰', kee: '基', keng: '庆',
  kheng: '庆', hing: '兴', kim: '金', kam: '金', kin: '健坚', kwang: '光', kwong: '光', leng: '玲龙', mun: '文敏',
  man: '文敏', mooi: '梅妹', moi: '梅', peng: '平', seng: '成盛生', shing: '成', sing: '成升', siang: '祥',
  siong: '祥雄', sin: '新欣', sum: '心', soon: '顺', swee: '瑞', teck: '德', tek: '德', teik: '德', tuck: '德', tak: '德',
  thiam: '添', wah: '华', hwa: '华', wai: '伟慧', wing: '永荣', yoong: '永勇', yoke: '玉', yuen: '元源', yit: '逸',
  yau: '有友', yiu: '耀', kiew: '娇',
};

// "Zhì", "ZHI", "zhi4" -> "zhi"; "lü" / "lu:" -> "lv"
function normalise(sound) {
  const lower = (sound || '').toLowerCase().replace(/ü|u:/g, 'v');
  return (lower.normalize ? lower.normalize('NFD') : lower).replace(/[^a-z]/g, '');
}

// Characters that could be written for this sound, likeliest first. [] = none known.
export function findCharacters(sound) {
  const key = normalise(sound);
  if (!key) return [];
  return [...new Set(Array.from((LOCAL[key] || '') + (PINYIN[key] || '')))];
}

// The parts of a name the app has characters for: "Jon Tan Zhi Ren" -> ['Tan', 'Zhi', 'Ren']
export function soundsIn(name) {
  const words = (name || '').split(/[^A-Za-z\u00C0-\u024F]+/).filter(Boolean);
  return [...new Set(words)].filter((word) => findCharacters(word).length > 0);
}
