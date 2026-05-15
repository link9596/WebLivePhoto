# 优雅地在网页上展示你的实况照片！
## Without APPLE LivephotoKit JS & Show Your LivePhoto on Web Easily !

[Demo](https://atlinker.cn/demo/livephoto.html)

# 食用文档 Document
## 安装 Install

下载 livephoto.css 和 livephoto.js 文件，在页面中引入：

Download livephoto.css & livephoto.css and include:
```html
<link rel="stylesheet" href=".../livephoto.css">
<script src=".../live-photo.js"></script>
```

## 初始化 Initialize

默认方式 Default initialize

```html
<script>
    // 默认：自动扫描所有 .live-photo 容器并初始化
    // default: Scan all .live-photo class to Pack
    LivePhoto.init();
</script>
```

```html
<script>
    // 指定选择器或元素，如查找所有id为myLivePhoto的元素
    // Specify a selector or element, such as finding all elements with the id myLivePhoto
     LivePhoto.init('#myLivePhoto');
</script>
```

## 展示实况照片 Show your LivePhoto

在想要展示实况照片的地方，以下方的html格式编写

Wherever u like:

```html
<div class="live-photo" id="myLivePhoto">
    <img class="live-photo-img" src="https://example.com/cover.jpg" alt="...">
    <video class="live-photo-video" playsinline muted preload="auto" poster="https://example.com/cover.jpg">
        <source src="https://example.com/video.mp4" type="video/mp4">
    </video>
</div>
```

当然还可以用简写成：

or in a short way:

```html
<div class="live-photo" id="myLivePhoto">
    <img class="live-photo-img" src="https://example.com/cover.jpg" alt="...">
    <video class="live-photo-video" src="https://example.com/video.mp4" type="video/mp4" playsinline muted preload="auto"></video>
</div>
```

Enjoy it！ 😆
