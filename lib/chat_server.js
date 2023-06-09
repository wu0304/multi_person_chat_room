/*
 * @FileDescription: ***
 * @Author: wu0304
 * @Date: 2023-06-15 23:31:17
 * @LastEditors: wu0304
 * @LastEditTime: 2023-06-18 23:56:01
*/
const socketIo = require('socket.io');
let io
let guestNumber = 1
const nickNames = {}
const namesUsed = []
const currentRoom = {}

exports.listen = function (server) {
    io = socketIo(server) // 启动Socket.IO服务器，允许它搭载在已有的HTTP服务器上
    io.sockets.on('connection', function (socket) { // 定义每个用户连接的处理逻辑
        guestNumber = assignGuestName(socket, guestNumber, nickNames, namesUsed) // 在用户连接上来时赋予其一个访客名
        joinRoom(socket, 'Lobby') // 在用户连接上来时把他放入聊天室Lobby里
        handleMessageBroadcasting(socket, nickNames) // 处理用户的消息，更名，以及聊天室的创建和变更
        handleNameChangeAttempts(socket, nickNames, namesUsed)
        handleRoomJoining(socket)

        socket.on('rooms', function () { // 用户发出请求时，向其提供已经被占用的聊天室的列表
            // console.log(io.sockets.adapter.rooms)
            // console.log([...io.sockets.adapter.rooms.keys()])
            socket.emit('rooms', [...io.sockets.adapter.rooms.keys()])
        })

        handleClientDisconnection(socket, nickNames, namesUsed) // 定义用户断开连接后的清除逻辑
    })
}

/**
 * 分配用户昵称
 * @param socket
 * @param guestNumber
 * @param nickNames
 * @param namesUsed
 * @returns {*}
 */
function assignGuestName(socket, guestNumber, nickNames, namesUsed) {
    let name = 'Guest' + guestNumber // 生成新昵称
    nickNames[socket.id] = name // 把用户昵称跟客户端连接 ID 关联上
    socket.emit('nameResult', { // 让用户知道他们的昵称
        success: true,
        name: name
    })
    namesUsed.push(name) // 存放已经被占用的昵称
    return guestNumber + 1 // 增加用来生成昵称的计数器
}

/**
 * 与进入聊天室相关的逻辑
 * @param socket
 * @param room
 */
function joinRoom(socket, room) {
    socket.join(room) // 让用户进入房间
    currentRoom[socket.id] = room // 记录用户的当前房间
    socket.emit('joinResult', {room: room}) // 让用户知道他们进入了新的房间

    // 让房间里的其他用户知道有新用户进入了房间
    socket.broadcast.to(room).emit('message', {
        text: nickNames[socket.id] + ' has joined ' + room + '.'
    })

    let usersInRoom = io.sockets.sockets // 确定有哪些用户在这个房间里
    if (usersInRoom.size > 1) { // 如果不止一个用户在这个房间里，汇总下都是谁
        let usersInRoomSummary = 'Users currently in ' + room + ': '
        usersInRoom.forEach((item, index) => {
            const userSocketId = item.id
            if (userSocketId !== socket.id) {
                if (index > 0) {
                    usersInRoomSummary += ', '
                }
                usersInRoomSummary += nickNames[userSocketId]
            }
        })
        usersInRoomSummary += '.'
        socket.emit('message', {text: usersInRoomSummary}) // 将房间里其他用户的汇总发送给这个用户
    }
}

/**
 * 更名请求的处理逻辑
 * @param socket
 * @param nickNames
 * @param namesUsed
 */
function handleNameChangeAttempts(socket, nickNames, namesUsed) {
    socket.on('nameAttempt', function (name) { // 添 加 nameAttempt事件的监听器
        if (name.indexOf('Guest') === 0) { // 昵称不能以Guest开头
            socket.emit('nameResult', {
                success: false,
                message: 'Names cannot begin with "Guest".'
            })
        } else {
            if (namesUsed.indexOf(name) === -1) { // 如果昵称还没注册就注册上
                let previousName = nickNames[socket.id]
                let previousNameIndex = namesUsed.indexOf(previousName)
                namesUsed.push(name)
                nickNames[socket.id] = name
                delete namesUsed[previousNameIndex] // 删掉之前用的昵称，让其他用户可以使用
                socket.emit('nameResult', {
                    success: true,
                    name: name
                })
                socket.broadcast.to(currentRoom[socket.id]).emit('message', {
                    text: previousName + ' is now know as ' + name + '.'
                })
            } else {
                socket.emit('nameResult', { // 如果昵称已经被占用，给客户端发送错误消息
                    success: false,
                    message: 'That name is already in use'
                })
            }
        }
    })
}

/**
 * 发送聊天消息
 * @param socket
 */
function handleMessageBroadcasting(socket) {
    socket.on('message', function (message) {
        socket.broadcast.to(message.room).emit('message', {
            text: nickNames[socket.id] + ': ' + message.text
        })
    })
}

/**
 * 创建房间
 * @param socket
 */
function handleRoomJoining(socket) {
    socket.on('join', function (room) {
        socket.leave(currentRoom[socket.id])
        joinRoom(socket, room.newRoom)
    })
}

/**
 * 用户断开连接
 * @param socket
 */
function handleClientDisconnection(socket) {
    socket.on('disconnect', function () {
        let nameIndex = namesUsed.indexOf(nickNames[socket.id])
        delete namesUsed[nameIndex]
        delete nickNames[socket.id]
    })
}
