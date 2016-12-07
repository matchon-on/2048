
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        // AMD. Register as an anonymous module.
        define(["MoEventEmitter"], factory);
    } else if (typeof module === "object" && module.exports) {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory(require("MoEventEmitter"));
    } else {
        // Browser globals (root is window)
        root.MatchOn = factory(root.MoEventEmitter);
    }
}(this, function (MoEventEmitter) {

    "use strict";

    var lastRequest, lastFeedBack;
    var retryAfter = 1000;

    /*!
     * MatchOn构造函数是MatchOn API的唯一对外暴露的对象，通过原型继承MoEventEmitter，兼容node.js EventEmitter的事件管理对象，在浏览器中实现
     * 事件驱动的编程．
     * 使用MatchOn API时，通过new MatchOn构造函数构造MatchOn对象，然后调用MatchOn API．
     * MatchonOn API所有的API调用，立即返回Int值，代表是否提交成功，处理接过通过发出事件处理接过消息，由订阅该事件的函数处理．
     *   当返回值为-1时，代表传递的参数校验未通过，未提交
     *   当返回值为 0时，代表参数校验通过，成功提交
     * 每个API的函数名，对应一个同名的操作命令．对每个操作命令，例如abcCommand，根据处理结果，MatchOn对象会发出三种不同的事件：
     *   "abcCommandSucceeded",代表处理成功；
     *   "abcCommandFailed", 代表处理异常；
     *   "abcCommandTimeout"，代表命令处理超时．
     * API调用者需要在调用前，通过matchon.on("eventName", function eventHandler(e) { 您的事件处理代码 })，注册该事件的处理函数．
     * MatchOn的事件处理的模式和API，与Nodejs的EventEmitter兼容，关于如何使用该API, 请见Nodejs官方文档：
     * 
     * https://nodejs.org/dist/latest-v6.x/docs/api/events.html
     * @class MatchOn 构造函数
     * @param {Object} options 构造MatchOn对象的参数,包含如下属性：
     *         matchingServer: String, 匹配服务器的域名或IP地址，如果不指定，使用默认值
     *         messagingServer: String,  消息服务器的域名或IP地址，如果不指定，使用默认值
     *         gameID: String,游戏的编号，用户在matchon.cn注册开发者账号后，创建新游戏时获得gameID
     *         secrete: String, 游戏安全秘钥，用户在matchon.cn注册开发账号后，创建新游戏时获得游戏安全秘钥
     *         timeout: Int, 初始化和连接后台的超时事件值，单位为秒
     * @return {Object} MatchOn对象.如果参数错误，将throw Error.
     *
     */

    function MatchOn (options) {

        this.options = options || {};

        if( !this.options.gameID ||
            !this.options.secrete)
            throw new Error("Parameter Error");


        this.options.matchingServer = this.options.matchingServer || "https://test.matchon.cn:9191";
        this.options.messagingServer = this.options.messagingServer || "https://test.matchon.cn:9292";
        this.options.timeout = this.options.timeout || 60;

        if( typeof this.options.gameID !== "string" ||
            typeof this.options.secrete !== "string" ||
            typeof this.options.timeout !== "number" ||
            this.options.timeout < 1)
            throw new Error("Parameter Error");

        this.events = {

            initSucceeded: "initSucceeded",
            initFailed: "initFailed",
            openSocketSucceeded: "openSocketSucceeded",
            openSocketFailed: "openSocketFailed",
            socketMsgReceived: "message",
            socketClosed: "socketClosed"

        };

        this.test = "MatchOn constructed";

        this.matchingServers = [this.options.matchingServer];
        this.currentMatchingServer = this.options.matchingServer;
        this.messagingServers = [this.options.messagingServer];
        this.currentMessagingServer = this.options.messagingServer;
        this.moRequest = moRequest.bind(this);

    };

    MatchOn.prototype = Object.create(MoEventEmitter.prototype);

    MatchOn.prototype.constructor = MatchOn;

    /**
     * 内部函数，产生一个随机整数
     * @para {Int} min, 最小值，包含在内
     * @para {Int} max, 最大值，不包含在内
     * @return {Int}　生成的随机数
     */

    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min)) + min;
    }    


    /**
     * 内部函数，在提交请求到后端，收到返回redirect指令后，redirect到新的服务器提交请求;
     * 在请求连接或者服务器错误时，尝试其他服务器；
     * @param {String} cmdType: 命令类型
     * @param {String} method: 请求方法
     * @param {String} uriTail: uri后部
     * @param {String} body: Json格式字符串，请求体
     * @param {Object} para: 传递给调用moRequest的函数的参数对象，在处理结果事件对象中原值返回
     * @param {Object} feedBack: 传递给调用moReqeust的函数的调用标志对象，在处理结果事件对象中原值返回．
     *                       由开发者自行设置．开发者在调用MatchOn API时，可以在本对象中设置对处理结果进行回调处理的函数
     * @return {Int}   返回值：　整数，-1代表参数错误，０代表成功提交
     */

    function moRequest(cmdType, method, uriTail, body, para, feedBack) {
        if(     !cmdType || !(typeof cmdType === "string") ||
                !method || !(typeof method === "string") ||
                !uriTail || !(typeof uriTail === "string"))

            return -1;

        var startTime = Date.now();

        var that = this;

        var uriHead = that.currentMatchingServer;

        var request = new XMLHttpRequest();

        var retryHandler = undefined;

        request.open(method, uriHead + uriTail, true);
        request.setRequestHeader("Content-type", "text/plain");
        request.setRequestHeader("If-Modified-Since", "Thu, 1 Jan 1970 00:00:00 GMT");
        request.setRequestHeader("Cache-Control", "no-cache");
        request.timeout = 1000;

        request.onreadystatechange = function (e) {
            if (request.readyState === 4) {

                switch ( request.status ) {
                case 599: //后端服务器已切换，尝试连接另一服务器
                    clearTimeout(retryHandler);

                    uriHead = that.currentMatchingServer = JSON.parse(request.responseText).server;

                    if( Date.now() - startTime > that.options.timeout * 1000 ) {

                        that.emit(cmdType + "Timeout", {
                            para: para,
                            feedBack: feedBack });

                    } else {

                        retryHandler = window.setTimeout(function() {
                            request.open(method, uriHead +  uriTail);
                            request.setRequestHeader("Content-type", "text/plain");
                            request.setRequestHeader("If-Modified-Since", "Thu, 1 Jan 1970 00:00:00 GMT");
                            request.setRequestHeader("Cache-Control", "no-cache");
                            request.timeout = 1000;
                            request.send(body); }, retryAfter);
                        
                    }
                    break;

                case 580: //后端已接受请求，等待０.5　秒后再次提交

                    window.clearTimeout(retryHandler);
                    retryHandler = window.setTimeout(function() {
                        request.open(method, uriHead + uriTail);

                        request.setRequestHeader("Content-type", "text/plain");
                        request.setRequestHeader("If-Modified-Since", "Thu, 1 Jan 1970 00:00:00 GMT");
                        request.setRequestHeader("Cache-Control", "no-cache");
                        request.timeout = 1000;

                        request.send(body); }, retryAfter);

                    break;

                case 200: // Succeeded

                    if( cmdType === "init") { //这是初始化命令，初始化服务器列表

                        var servers = JSON.parse(request.responseText);

                        that.matchingServers = servers.matchingServers;

                        that.currentMatchingServer = that.matchingServers[getRandomInt(0,that.matchingServers.length)];

                        that.messagingServers = servers.messagingServers;

                        that.currentMessagingServer = that.messagingServers[getRandomInt(0,that.messagingServers.length)];

                        that.emit(cmdType + "Succeeded");

                    } else {
                        if( !request.responseText || request.responseText.trim() == "") 
                            that.emit(cmdType + "Succeeded", {
                                para: para,
                                feedBack: feedBack} );
                        else 
                            that.emit(cmdType + "Succeeded", {
                                para: para,
                                feedBack: feedBack,
                                data: JSON.parse(request.responseText) });

                    }

                    break;

                case 0: //提交请求或者服务错误，尝试另一服务器

                    that.currentMatchingServer = that.matchingServers[getRandomInt(0, that.matchingServers.length)];
                    uriHead = that.currentMatchingServer;

                    window.clearTimeout(retryHandler);

                    if( Date.now() - startTime > that.options.timeout * 1000 ) 
                        that.emit(cmdType + "Error", {
                            code: -1, //Network or other system errors
                            para: para,
                            feedBack: feedBack });
                    else {

                        retryHandler = window.setTimeout( function() {
                            request.open(method, uriHead + uriTail);
                            request.setRequestHeader("Content-type", "text/plain");
                            request.setRequestHeader("If-Modified-Since", "Thu, 1 Jan 1970 00:00:00 GMT");
                            request.setRequestHeader("Cache-Control", "no-cache");
                            request.timeout = 1000;

                            request.send(body); }, retryAfter );
                    }
                    break;
                default: 

                    window.clearTimeout(retryHandler);

                    that.emit(cmdType + "Error", {
                        code: request.status,
                        para: para,
                        feedBack: feedBack});
                    break;

                }
            }
        };

        request.onerror = function (e) {

            that.currentMatchingServer = that.matchingServers[getRandomInt(0, that.matchingServers.length)];
            uriHead = that.currentMatchingServer;

            window.clearTimeout(retryHandler);

            if( Date.now() - startTime > that.options.timeout * 1000 ) 
                that.emit(cmdType + "Error", {
                    code: -1, //Network or other system errors
                    para: para,
                    feedBack: feedBack });
            else {

                retryHandler = window.setTimeout( function() {
                    request.open(method, uriHead + uriTail);
                    request.setRequestHeader("Content-type", "text/plain");
                    request.setRequestHeader("If-Modified-Since", "Thu, 1 Jan 1970 00:00:00 GMT");
                    request.setRequestHeader("Cache-Control", "no-cache");
                    request.timeout = 1000;

                    request.send(body); }, retryAfter );
            }
        };

        request.ontimeout = function (e) {

            window.clearTimeout(retryHandler);

            that.currentMatchingServer = that.matchingServers[getRandomInt(0, that.matchingServers.length)];
            uriHead = that.currentMatchingServer;
            if( Date.now() - startTime > that.options.timeout * 1000 ) 
                that.emit(cmdType + "Timeout", {
                    para: para,
                    feedBack: feedBack });
            else {
                retryHandler = window.setTimeout( function() {
                    request.open(method, uriHead + uriTail);
                    request.setRequestHeader("Content-type", "text/plain");
                    request.setRequestHeader("If-Modified-Since", "Thu, 1 Jan 1970 00:00:00 GMT");
                    request.setRequestHeader("Cache-Control", "no-cache");
                    request.timeout = 1000;

                    request.send(body);}, retryAfter);
            }
        };

        request.send(body);

        return 0;

    }

    /** 
     * 初始化API
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Boolean} 初始化是否成功
     * @events {消息：　String,消息数据： Object}
     *         "initSucceeded",初始化成功，　
     *　　　　　　　　消息数据对象：　
     *                    { para: undefined, feedBack: feedBack, data: undefined }
     *        "initError",初始化失败，                        
     *　　　　　　　　消息数据对象：　
     *                    { code: Int, 错误代码，para: undefined, feedBack: feedBack, data: undefined }
     *        "initTimeout", 初始化超时
     *　　　　　　　　消息数据对象：　
     *                    { para: undefined, feedBack: feedBack, data: undefined }
     */
    MatchOn.prototype.init = function (feedBack) {
        
        var request = new XMLHttpRequest();

        var uri = "/servers/" + this.options.gameID + "/" + this.options.secrete;
        return(this.moRequest("init","GET", uri, undefined, undefined, feedBack));

    };

    /**
     * 提交新匹配请求
     * @param {Object} para 匹配请求，如下数据格式：
     *                {
     *                  requestID: String, 请求编号，在一个游戏内必须唯一,
     *                  playerID: String, 游戏玩家编号，在一个游戏内必须唯一,
     *                  algo: String, 游戏算法编号，０：时间顺序匹配，１：级别顺序匹配，２：级别错位匹配，９９：指定匹配
     *                  para: String, 游戏参数，算法为0和９９时无意义，算法为１和２时，设为数字格式的字符串，代表游戏玩家经验，等级或战斗力等参数
     *                 }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} 是否成功提交
     *               0 - 成功提交, -1 - 数据错误
     * @events {消息：　String,消息数据： Object}
     *         "newMatchSucceeded",新匹配成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: Object，返回匹配结果，详细格式参见官网消息定义列表 }
     *        "newMatchError",新匹配失败
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "initTimeout", 新匹配超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */

    MatchOn.prototype.newMatch = function(para, feedBack) {

        if( !para || 
            !para.requestID || 
            !para.playerID ||
            !para.algo )
            return -1;

        if( para.algo !== "0" &&
            para.algo !== "1" &&
            para.algo !== "2" &&
            para.algo !== "99")
            return -1;

        if((para.algo === "1" ||
           para.algo === "2") &&
           !para.para)
            return -1;

        if( para.algo === "1" ||
            para.algo === "2") {
            var paraN = Number(para.para);
            if( isNaN(paraN) )
                return -1;
        }

        var body = JSON.stringify(para);

        this.moRequest("newMatch","POST", "/match/" + this.options.gameID + "/" + this.options.secrete, body, para, feedBack);

        return 0;
    };

    /**
     * 建立Socket连接
     * @param {Object} para 建立socket参数
     *                                   {
     *                                     playerID: String, 游戏玩家编号,
     *                                     matchID: String, 比赛编号
     *                                   }
     * @param {Object} feedBack 建立Socket连接相应事件中返回，由用户自行设置
     * @return {Int} -1 参数错误
     *                0 提交建立Socket连接请求
     *                1 当前Socket仍在连接状态
     * 
     * @events {消息：　String,消息数据： Object}
     *         "openSocketSucceeded",建立socket连接失败
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     *        "openSocketError",建立socket连接失败
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "openSocketTimeout", 建立socket超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     *        "scoketClosed"，socket已关闭
     *             消息对象：
     *                    { code: 消息关闭代码，见WebSocket协议官方代码表，para: para, feedBack: feedBack, data: undefined }
     *        "message", 收到游戏通讯消息
     *                    { para: para, feedBack: feedBack, data: Object，收到的消息，详细格式见官网消息格式表 }
     */

    MatchOn.prototype.openSocket = function(para, feedBack) {
        if( !para ||
            !para.playerID ||
            !para.matchID)
            return -1;

        var that = this;

        var retryHandler = undefined;
        
        if( that.currentSocket && that.currentSocket.readyState === 1)
            return 1;

        lastRequest = para;
        lastFeedBack = feedBack;

        var startTime = Date.now();

        var request = new XMLHttpRequest();
        
        var uri = that.currentMessagingServer + "/whichserver/" + that.options.gameID + "/" + that.options.secrete;

        request.open("GET",uri,true);
        request.timeout = that.options.timeout * 1000;
        request.onload = function (e) {

            if (request.readyState === 4) {
                if (request.status === 200 || request.status === 599) {

                    window.clearTimeout(retryHandler);

                    that.currentMessagingServer = JSON.parse(request.responseText).server;

                    var connectionString = "wss://" + that.currentMessagingServer.trim().slice(8) + "/websocket/" + that.options.gameID + "/" + para.playerID + "/" + para.matchID + "/" + that.options.secrete;

                    var ws = new WebSocket(connectionString);
                    console.log(connectionString);
                    ws.onopen = function (e) {

                        that.currentSocket = ws;

                        that.emit(that.events.openSocketSucceeded, {
                            para: para, 
                            feedBack:feedBack});
                    };
                    
                    ws.onerror = function(e) {


                        if( Date.now() - startTime >  that.options.timeout * 1000)
                            that.emit(that.events.openSocketFailed, {
                                para: para,
                                feedBack: feedBack});
                        else {
                            retryHandler = window.setTimeout( function() {
                                that.currentMessagingServer = that.messagingServers[getRandomInt(0,that.messagingServers.length)];
                                uri = that.currentMessagingServer + "/whichserver/" + that.options.gameID + "/" + that.options.secrete;
                                request.open("GET",uri,true);
                                request.send(null); }, retryAfter );
                        }
                            
                    };

                    ws.onclose = function(e) {

                        that.emit(that.events.socketClosed, {
                            code: e.code,
                            para: para,
                            feedBack: feedBack});
                    };

                    ws.onmessage = function(e) {

                        that.emit(that.events.socketMsgReceived, {
                            para: para, 
                            feedBack: feedBack, 
                            message: e.data
                        });

                    };


                } else {

                    window.clearTimeout(retryHandler);

                    if( Date.now() - startTime >  that.options.timeout * 1000)
                        that.emit(that.events.openSocketFailed, {
                            para: para, 
                            feedBack: feedBack
                        });
                    else {
                        retryHandler = window.setTimeout( function () {
                            that.currentMessagingServer = that.messagingServers[getRandomInt(0,that.messagingServers.length)];
                            uri = that.currentMessagingServer + "/whichserver/" + that.options.gameID + "/" + that.options.secrete;
                            request.open("GET",uri,true);
                            request.send(null); }, retryAfter );
                    }

                }
            }
        };

        request.onerror = function (e) {


            window.clearTimeout(retryHandler);

            if( Date.now() - startTime >  that.options.timeout * 1000)

                that.emit(that.events.openSocketFailed, {
                    para: para,
                    feedBack: feedBack
                });

            else {

                retryHandler = window.setTimeout( function () {
                    that.currentMessagingServer = that.messagingServers[getRandomInt(0,that.messagingServers.length)];
                    uri = that.currentMessagingServer + "/whichserver/" + that.options.gameID + "/" + that.options.secrete;
                    request.open("GET",uri,true);

                    request.send(null); }, retryAfter );

            }

        };

        request.ontimeout = function (e) {



            window.clearTimeout(retryHandler);

            if( Date.now() - startTime >  that.options.timeout * 1000)

                that.emit(that.events.openSocketFailed, {

                    para: para, 
                    feedBack: feedBack});

            else {

                //Try another server.
                retryHandler = window.setTimeout( function() {
                    that.currentMessagingServer = that.messagingServers[getRandomInt(0,that.messagingServers.length)];
                    uri = that.currentMessagingServer + "/whichserver/" + that.options.gameID + "/" + that.options.secrete;
                    request.open("GET",uri,true);
                    request.send(null); }, retryAfter );

            }
        };

        request.send(null);

        return 0;
    };


    /**
     * 发送消息
     * @param {String} type 消息类型，２个字节
     * @param {Object} content 消息内容，任何对象，将会被转换为JSON字符串发送
     * @return {Int} 如果socket不存在，返回-2,
     *               如果参数错误，返回-1,
     *               如果正常状态,提交发送，返回１，
     *               如果正在建立连接，返回０，
     *               如果正在关闭，返回2，
     *               如果已关闭，返回３
     *
     */


    MatchOn.prototype.sendMessage = function (type, content) {

        if(!type ||
           !content ||
           (typeof type) !== "string" ||
           type.length != 2)
            return -1;

        var msg = JSON.stringify({
            type: type,
            content: content});

        return this.sendString(msg.trim());
        
    };



    /**
     * 发送消息
     * @param {String} message: 等待发送的消息
     * @return {Int} 如果socket不存在，返回-2,
     *               如果参数错误，返回-1,
     *               如果正常状态,提交发送，返回１，
     *               如果正在建立连接，返回０，
     *               如果正在关闭，返回2，
     *               如果已关闭，返回３
     *
     */


    MatchOn.prototype.sendString = function (message) {

        if(!message ||
           !(typeof message === "string"))
            return -1;

        if(!this.currentSocket)
            return -1;

        if(this.currentSocket.readyState != 1)
            return this.currentSocket.readyState;

        this.currentSocket.send(message);

        return 1;
    };

    /**
     * 断开Socket连接
     */

    MatchOn.prototype.disconnect = function ( feedBack) {

        if(!this.currentSocket)
            return -1;

        lastFeedBack = feedBack;

        this.currentSocket.close();

        return 0;

    };


    /**
     * 使用上一个连接请求，重新建立连接
     * @param {Object} feedBack: 连接请求的标志对象，包含在连接事件中
     * @return {Int} -1 参数错误
     *                0 提交建立Socket连接
     */
    MatchOn.prototype.reconnect = function (feedBack) {
        return this.openSocket(lastRequest, feedBack || lastFeedBack);
    };

    /**
     * 撤销匹配请求．　如果原请求已匹配成功，则无法撤销
     * @param {Object} canceMatchingRequest, 撤销匹配请求对象，格式：　
     *  　　　　　　　　　　{  cancelID: String, 本次撤销请求的编号,
     *                      playerID: String,玩家编号,
     *                      algo: String,原算法编号,
     *                      para: String, 原匹配请求编号
     *                   }
     * @return  0 提交成功
     *          -1 数据错误，提交失败
     * @events {消息：　String,消息数据： Object}
     *         "cancelMatchingSucceeded",撤销成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     *        "cancelMatchingError",撤销匹配错误
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "cancelMatchingTimeout", 侧小匹配超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */

    MatchOn.prototype.cancelMatchingRequest = function (para, feedBack) {
        if( !para ||
            !para.cancelID ||
            !para.playerID ||
            !para.originalRequestID ||
            !para.originalAlgo)
            return -1;

        var uri = "/match/" + this.options.gameID + "/" + this.options.secrete;
        var body = {
            requestID: para.cancelID,
            playerID: para.playerID,
            algo: para.originalAlgo,
            para: para.originalRequestID
        };
        return this.moRequest("cancelMatching", "DELETE", uri, JSON.stringify(body), para, feedBack);
    };


    /**
     *　加入指定的游戏
     * @param {Object} para 匹配请求
     * @param {String} matchID 指定的比赛编号
     * @return 
     */

    MatchOn.prototype.joinMatch = function (para, feedBack) {

        if( !para || 
            !para.requestID || 
            !para.matchID ||
            !para.playerID ||
            !para.algo )
            return -1;

        if( para.algo !== "99")
            return -1;

        var body = JSON.stringify(para);

        var uri = "/joinmatch/" + para.matchID +"/" + this.options.gameID + "/" + this.options.secrete;

        return this.moRequest("joinMatch", "POST", uri, body, para, feedBack);
    };

    /** 
     * 读取比赛的活动玩家列表和信息
     * @param 
     */

    MatchOn.prototype.getActivePlayers = function (para, feedBack) {
        if( !para || !para.matchID || !(typeof para.matchID === "string") )
            return -1;

        var uri = "/activeplayers/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
        return this.moRequest("getActivePlayers", "GET", uri, null, para, feedBack);

    };
    
    /** 
     * 读取比赛的非活动玩家列表和信息
     * @param 
     */

    MatchOn.prototype.getInActivePlayers = function (para, feedBack) {

        if( !para || !para.matchID || !(typeof para.matchID === "string") )
            return -1;

        var uri = "/inactiveplayers/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
        return this.moRequest("getInActivePlayers", "GET", uri, null, para, feedBack);

    };
    
    /**
     * 将游戏非活跃用户设置为活跃状态
     * @param {Object} para：参数，格式：
     *          {
     *              playerID: String,游戏玩家编号,
     *              matchID: String, 比赛编号
     *          }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} -1：参数数据格式错误, 0: 提交成功
     * @events {消息：　String,消息数据： Object}
     *         "setActiveSucceeded",新匹配成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack　}
     *        "setActiveError",设置错误
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "setActiveTimeout", 设置超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */

    MatchOn.prototype.setActive = function(para, feedBack) {
        if( !para || 
            !para.playerID || 
            !(typeof para.playerID === "string") ||
            !para.matchID ||
            !(typeof para.matchID === "string"))
            return -1;
        
        var uri = "/setactive/" + para.playerID + "/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
        
        return this.moRequest("setActive", "PUT", uri, null, para, feedBack);

    };

    /**
     * 将比赛活跃用户设置为非活跃状态
     * @param {Object} para：参数，格式：
     *          {
     *              playerID: String,游戏玩家编号,
     *              matchID: String, 比赛编号
     *          }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} -1：参数数据格式错误, 0: 提交成功
     * @events {消息：　String,消息数据： Object}
     *         "setInActiveSucceeded",设置成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack　}
     *        "setInActiveError",设置错误
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "setInActiveTimeout", 设置超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */

    MatchOn.prototype.setInActive = function(para, feedBack) {
        if( !para || 
            !para.playerID || 
            !(typeof para.playerID === "string") ||
            !para.matchID ||
            !(typeof para.matchID === "string"))
            return -1;
        
        var uri = "/setinactive/" + para.playerID + "/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
        
        return this.moRequest("setInActive", "PUT", uri, null, para, feedBack);

    };

    /**
     * 按消息类型，获得游戏玩家在比赛中的最后一条消息
     * @param {Object} para：参数，格式：
     *          {
     *              playerID: String,游戏玩家编号,
     *              matchID: String, 比赛编号,
     *              type: String, 消息类型
     *          }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} -1：参数数据格式错误, 0: 提交成功
     * @events {消息：　String,消息数据： Object}
     *         "playerLastMessageSucceeded",获得消息成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: Object，玩家在该比赛中的最后一条消息　}
     *        "playerLastMessageError",获得消息失败
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: Object,玩家在该比赛中的最后一条消息 }
     *        "playerLastMessageTimeout", 获得消息超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */



    MatchOn.prototype.playerLastMessage = function(para,feedBack) {
        if( !para || 
            !para.playerID || 
            !(typeof para.playerID === "string") ||
            !para.matchID ||
            !(typeof para.matchID === "string")||
            !para.type ||
            !(typeof para.type === "string"))

            return -1;

        var uri = "/lastmatchmsg/" + para.playerID + "/" + para.matchID + "/" + para.type + "/" + this.options.gameID + "/" + this.options.secrete;
        return this.moRequest("playerLastMessage", "GET", uri, null, para,feedBack);

    };

    /**
     * 按消息类型，获得游戏玩家的最后一次比赛的信息
     * @param {Object} para：参数，格式：
     *          {
     *              playerID: String,游戏玩家编号
     *          }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} -1：参数数据格式错误, 0: 提交成功
     * @events {消息：　String,消息数据： Object}
     *         "playerLastMatchSucceeded",获得最后一个比赛成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: Object，玩家的最后一个比赛的信息，详细格式见官网消息列表　}
     *        "playerLastMatchError",获得最后一个比赛失败
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: Object,玩家在该比赛中的最后一条消息 }
     *        "playerLastMatchTimeout", 获得最后一个比赛超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */

    MatchOn.prototype.playerLastMatch = function (para,feedBack) {

        if( !para ||
            !para.playerID ||
            !(typeof para.playerID === "string"))
            return -1;
        var uri = "/lastmatch/" + para.playerID + "/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;

        return this.moRequest("playerLastMatch", "GET", uri, null, para, feedBack);
    };


    /**
     * 按作用域，设置键值对
     * @param {Object} para：参数，格式：
     *          {
     *              domain: String, 域，"game"－游戏，"gameMatch" - 游戏/比赛，　"gamePlayer" - 游戏/玩家 "gamePlayerMatch"　－　游戏／玩家／比赛
     *              keyName: String, 主键名称，在不同作用域，主键名称可以相同
     *              playerID: String,游戏玩家编号，当domain为gamePlayer时有效
     *              matchID: String，比赛编号，当domain为gamePlayerMatch和gameMatch时有效
     *              force: String, 强制设置标志, "s" - 设置，　"l" -设置并加锁，加锁后其他人无法设置, "f" - 强制设置，不论该键值是否加锁，强制更新
     *              keyMap: Object, 子键和值的映射
     *          }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} -1：参数数据格式错误, 0: 提交成功
     * @events {消息：　String,消息数据： Object}
     *         "setKVSucceeded", 设置成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined　}
     *        "setKVError",设置键值对错误
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "setKVTimeout", 获得最后一个比赛超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */
    MatchOn.prototype.setKV = function (para,feedBack) {

        if( !para ||
            !para.force ||
            !(typeof para.force == "string")||
            !para.domain ||
            !(typeof para.domain == "string") ||
            !para.keyName ||
            !(typeof para.keyName === "string") ||
            !(para.domain === "game" ||
              para.domain === "gameMatch" ||
              para.domain === "gamePlayer" ||
              para.domain === "gamePlayerMatch"))
            return -1;

        var uri;
        switch (para.domain) {

        case "game" :
            if(!para.keyMap ||
               !(para.keyMap instanceof Object))
                return -1;

            uri = "/kkv/game/" + para.keyName + "/" +  para.force + "/" + this.options.gameID + "/" + this.options.secrete;
            break;

        case "gamePlayer" :
            if(!para.keyMap ||
               !(para.keyMap instanceof Object) ||
               !para.playerID ||
               !(typeof para.playerID === "string"))
                return -1;
            uri = "/kkv/gameplayer/" + para.keyName + "/" +  para.force + "/" + para.playerID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;

        case "gameMatch" :
            if(!para.keyMap ||
               !(para.keyMap instanceof Object) ||
               !para.matchID ||
               !(typeof para.matchID === "string"))
                return -1;
            uri = "/kkv/gamematch/" + para.keyName + "/" +  para.force + "/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;

        case "gamePlayerMatch" :
            if(!para.keyMap ||
               !(para.keyMap instanceof Object) ||
               !para.playerID ||
               !(typeof para.playerID === "string")||
               !para.matchID ||
               !(typeof para.matchID === "string"))

                return -1;
            uri = "/kkv/gameplayermatch/" + para.keyName + "/" +  para.force + "/" + para.playerID + "/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;
        }
        return this.moRequest("setKV", "POST", uri, JSON.stringify(para.keyMap), para,feedBack);
    };

    /**
     * 读取键值对
     * @param {Object} para：参数，格式：
     *          {
     *              domain: String, 域，"game"－游戏，"gameMatch" - 游戏/比赛，　"gamePlayer" - 游戏/玩家 "gamePlayerMatch"　－　游戏／玩家／比赛
     *              keyName: String, 主键名称，在不同作用域，主键名称可以相同
     *              playerID: String,游戏玩家编号，当domain为gamePlayer时有效
     *              matchID: String，比赛编号，当domain为gamePlayerMatch和gameMatch时有效
     *          }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} -1：参数数据格式错误, 0: 提交成功
     * @events {消息：　String,消息数据： Object}
     *         "getKVSucceeded", 读取成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: Object，键值对　}
     *        "getKVError",读取键值对错误
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "getKVTimeout", 读取键值对超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */

    MatchOn.prototype.getKV = function (para, feedBack) {
        if( !para ||
            !para.domain ||
            !(typeof para.domain == "string") ||
            !para.keyName ||
            !(typeof para.keyName === "string") ||
            !(para.domain == "game" ||
              para.domain == "gamePlayer" ||
              para.domain == "gameMatch" ||
              para.domain == "gamePlayerMatch"))
            return -1;

        var uri;

        switch (para.domain) {
        case "game":
            uri = "/kkv/game/" + para.keyName + "/" + this.options.gameID + "/" + this.options.secrete;
            break;
        case "gamePlayer":
            if( !para.playerID ||
                !(typeof para.playerID === "string"))
                return -1;
            uri = "/kkv/gameplayer/" + para.keyName + "/" + para.playerID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;
        case "gameMatch" :
            if(!para.matchID ||
               !(typeof para.matchID === "string"))
                return -1;
            uri = "/kkv/gamematch/" + para.keyName + "/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;

        case "gamePlayerMatch": 
            if( !para.playerID ||
                !(typeof para.playerID === "string") ||
                !para.matchID ||
                !(typeof para.matchID === "string"))
                return -1;
            uri = "/kkv/gameplayermatch/" + para.keyName + "/" + para.playerID + "/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;
        }
        
        return this.moRequest("getKV","GET", uri, null, para, feedBack);

    };


    /**
     * 删除键值对或键值对的之键
     * @param {Object} para：参数，格式：
     *          {
     *              domain: String, 域，"game"－游戏，"gameMatch" - 游戏/比赛，　"gamePlayer" - 游戏/玩家 "gamePlayerMatch"　－　游戏／玩家／比赛
     *              keyName: String, 主键名称，在不同作用域，主键名称可以相同
     *              playerID: String,游戏玩家编号，当domain为gamePlayer时有效
     *              matchID: String，比赛编号，当domain为gamePlayerMatch和gameMatch时有效
     *              subKeys: Array, 字符串数组，待删除的子键，如果数组长度为０，代表删除整个主键
     *          }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} -1：参数数据格式错误, 0: 提交成功
     * @events {消息：　String,消息数据： Object}
     *         "deleteKVSucceeded", 删除成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined　}
     *        "deleteKVError",读取键值对错误
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "deleteKVTimeout", 读取键值对超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */

    MatchOn.prototype.deleteKV = function(para,feedBack) {

        if( !para ||
            !para.domain ||
            !(typeof para.domain == "string") ||
            !para.keyName ||
            !(typeof para.keyName === "string") ||
            !(para.domain == "game" ||
              para.domain == "gamePlayer" ||
              para.domain == "gameMatch" ||
              para.domain == "gamePlayerMatch") ||
            !para.subKeys ||
            !(para.subkeys instanceof Array))
            return -1;

        var uri;

        switch(para.domain) {

        case "game":
            uri = "/kkv/game/" + para.keyName + "/" + this.options.gameID + "/" + this.options.secrete;
            break;
        case "gameMatch" :
            uri = "/kkv/gamematch/" + para.keyName  + "/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;

        case "gamePlayer":
            uri = "/kkv/gameplayer/" + para.keyName + "/" + para.playerID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;
        case "gamePlayerMatch":
            uri = "/kkv/gameplayermatch/" + para.keyName + "/" + para.playerID +"/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;
        }
        return this.moRequest("deleteKV","DELETE", uri, JSON.stringify(para.subKeys), para, feedBack);

    };


    /**
     * 检查键值对是否已上锁
     * @param {Object} para：参数，格式：
     *          {
     *              domain: String, 域，"game"－游戏，"gameMatch" - 游戏/比赛，　"gamePlayer" - 游戏/玩家 "gamePlayerMatch"　－　游戏／玩家／比赛
     *              keyName: String, 主键名称，在不同作用域，主键名称可以相同
     *              playerID: String,游戏玩家编号，当domain为gamePlayer时有效
     *              matchID: String，比赛编号，当domain为gamePlayerMatch和gameMatch时有效
     *          }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} -1：参数数据格式错误, 0: 提交成功
     * @events {消息：　String,消息数据： Object}
     *         "checkKVSucceeded", 检查成功，代表未上锁
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined　}
     *        "checkKVError",检查错误，如果code字段为570，代表已上锁
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "checkKVTimeout", 读取键值对超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */


    MatchOn.prototype.checkKVLock = function(para, feedBack) {

        if( !para ||
            !para.domain ||
            !(typeof para.domain == "string") ||
            !para.keyName ||
            !(typeof para.keyName === "string") ||
            !(para.domain == "game" ||
              para.domain == "gamePlayer" ||
              para.domain == "gameMatch" ||
              para.domain == "gamePlayerMatch"))

            return -1;
        var uri;

        switch(para.domain) {

        case "game":
            uri = "/kkvlock/game/" + para.keyName + "/" + this.options.gameID + "/" + this.options.secrete;
            break;

        case "gameMatch":
            uri = "/kkvlock/gamematch/" + para.keyName + "/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;

        case "gamePlayer":
            uri = "/kkvlock/gameplayer/" + para.keyName + "/" + para.playerID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;

        case "gamePlayerMatch":
            uri = "/kkvlock/gameplayermatch/" + para.keyName + "/" + para.playerID +"/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;

        }

        return this.moRequest("checkKVLock","GET", uri, null, para, feedBack);
        

    };

    /**
     * 解除主键锁
     * @param {Object} para：参数，格式：
     *          {
     *              domain: String, 域，"game"－游戏，"gameMatch" - 游戏/比赛，　"gamePlayer" - 游戏/玩家 "gamePlayerMatch"　－　游戏／玩家／比赛
     *              keyName: String, 主键名称，在不同作用域，主键名称可以相同
     *              playerID: String,游戏玩家编号，当domain为gamePlayer时有效
     *              matchID: String，比赛编号，当domain为gamePlayerMatch和gameMatch时有效
     *          }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} -1：参数数据格式错误, 0: 提交成功
     * @events {消息：　String,消息数据： Object}
     *         "unlockKVSucceeded", 解锁成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined　}
     *        "unlockKVError",解锁失败
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "unlockKVTimeout", 解锁超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */


    MatchOn.prototype.unlockKV = function(para,feedBack) {
        if( !para ||
            !para.domain ||
            !(typeof para.domain == "string") ||
            !para.keyName ||
            !(typeof para.keyName === "string") ||
            !(para.domain == "game" ||
              para.domain == "gamePlayer" ||
              para.domain == "gameMatch" ||
              para.domain == "gamePlayerMatch"))

            return -1;
        var uri;

        switch(para.domain) {

        case "game":
            uri = "/kkvunlock/game/" + para.keyName + "/" + this.options.gameID + "/" + this.options.secrete;
            break;

        case "gameMatch":
            uri = "/kkvunlock/gamematch/" + para.keyName + "/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;

        case "gamePlayer":
            uri = "/kkvunlock/gameplayer/" + para.keyName + "/" + para.playerID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;
        case "gamePlayerMatch":
            uri = "/kkvunlock/gameplayermatch/" + para.keyName + "/" + para.playerID +"/" + para.matchID + "/" + this.options.gameID + "/" + this.options.secrete;
            break;
        }

        return this.moRequest("unlockKV","PUT", uri, null, para, feedBack);

    };

    /**
     * 取得游戏玩家的最近一次比赛的ID
     * @param {Object} para: 参数，格式为：
     *       {
     *         playerID: String, 游戏玩家ID
     *       }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} -1：参数数据格式错误, 0: 提交成功
     * @events {消息：　String,消息数据： Object}
     *         "getLastMatchSucceeded", 读取最后一个比赛ID成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: Object　}
     *             data字段数据格式:
     *             {
     *               "matchID": "abcedfg"
     ＊　　　　　　　　}
     *        "getLastMatchError",解锁失败
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "getLastMatchTimeout", 解锁超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */

    MatchOn.prototype.getLastMatch = function (para, feedBack) {
        if( !para ||
            !para.playerID ||
            typeof para.playerID !== "string" ||
            para.playerID.length === 0)
            return -1;
        var uri = "/lastmatch/" + para.playerID + "/" + this.options.gameID + "/" + this.options.secrete;
        return this.moRequest("getLastMatch", "GET", uri, null, para, feedBack);

    };

    /**
     * 按消息类型，取得游戏玩家的最后一条比赛消息
     * @param {Object} para: 参数，格式为：
     *       {
     *         playerID: String, 游戏玩家ID,
     *         matchID: String, 比赛ID,
     *         type:  String, 消息类型
     *       }
     * @param {Object} feedBack: 随着处理结果事件回传的标志对象
     * @return {Int} -1：参数数据格式错误, 0: 提交成功
     * @events {消息：　String,消息数据： Object}
     *         "getLastMatchMessageSucceeded", 读取最后一个比赛ID成功
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: Object　}
     *             data字段数据格式:
     *             {
     *               profile: {
     *                  playerID: String, 玩家ID,
     *                  gameID: String, 游戏ID,
     *                  matchID: String, 比赛ID
     *               },
     *               data: {
     *                  type: "ab",消息类型
     *                  content: Object,原消息内容
     *               }
     *　　　　　　　　}
     *        "getLastMatchMessageError",解锁失败
     *　　　　　　　　消息数据对象：
     *                    { code: Int, 错误代码，详细代码表参见官网，para: para, feedBack: feedBack, data: undefined }
     *        "getLastMatchMessageTimeout", 解锁超时
     *　　　　　　　　消息数据对象：　
     *                    { para: para, feedBack: feedBack, data: undefined }
     */

    MatchOn.prototype.getLastMatchMessage = function (para, feedBack) {
        if( !para ||
            !para.playerID ||
            typeof para.playerID !== "string" ||
            para.playerID.length === 0 ||
            !para.matchID ||
            typeof para.matchID !== "string" ||
            para.matchID.length === 0 ||
            !para.type ||
            typeof para.type !== "string" ||
            para.type.length != 2
          )
            return -1;

        var uri = "/lastmatchmsg/" + para.playerID + "/" + para.matchID + "/" + para.type + "/" + this.options.gameID + "/" + this.options.secrete;
        console.log(uri);
        return this.moRequest("getLastMatchMessage", "GET", uri, null, para, feedBack);

    };


    return MatchOn;
    
}));
