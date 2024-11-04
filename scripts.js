function initCarousel() {
    const carousel = document.querySelector('.carousel');
    const items = carousel.querySelectorAll('.carousel-item');
    const nav = carousel.querySelector('.carousel-nav');
    
    // 自动生成导航点
    items.forEach((_, index) => {
        const dot = document.createElement('span');
        dot.className = `carousel-nav-item ${index === 0 ? 'active' : ''}`;
        dot.addEventListener('click', () => showSlide(index));
        nav.appendChild(dot);
    });

    let currentSlide = 0;

    function showSlide(index) {
        // 隐藏所有幻灯片
        items.forEach(item => item.classList.remove('active'));
        // 取消所有导航点的激活状态
        nav.querySelectorAll('.carousel-nav-item').forEach(dot => dot.classList.remove('active'));
        
        // 显示当前幻灯片
        items[index].classList.add('active');
        nav.children[index].classList.add('active');
        currentSlide = index;
    }

    function nextSlide() {
        showSlide((currentSlide + 1) % items.length);
    }

    function prevSlide() {
        showSlide((currentSlide - 1 + items.length) % items.length);
    }

    // 添加按钮事件监听
    carousel.querySelector('.prev').addEventListener('click', prevSlide);
    carousel.querySelector('.next').addEventListener('click', nextSlide);
}

// 页面加载完成后初始化轮播图
document.addEventListener('DOMContentLoaded', function() {
    initCarousel();
    generateTOC();
    initTheme();
});

// 分离主题初始化函数
function initTheme() {
    const themeToggle = document.querySelector('.theme-toggle');
    const icon = themeToggle.querySelector('i');
    
    // 检查本地存储中的主题设置
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
        icon.textContent = 'dark_mode';
    } else {
        document.body.classList.remove('dark-theme');
        icon.textContent = 'light_mode';
    }
    
    // 切换主题
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        icon.textContent = isDark ? 'dark_mode' : 'light_mode';
    });
}

// 修改 generateTOC 函数
function generateTOC() {
    const toc = document.getElementById('toc');
    const headings = document.querySelectorAll('h2, h3');
    const tocLinks = [];

    headings.forEach(heading => {
        if (!heading.id) {
            heading.id = heading.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        }
        
        const link = document.createElement('a');
        link.href = `#${heading.id}`;
        link.textContent = heading.textContent;
        
        if (heading.tagName === 'H3') {
            link.classList.add('h3-link');
        }
        
        link.addEventListener('click', (e) => {
            e.preventDefault();
            heading.scrollIntoView({ behavior: 'smooth' });
            // 更新 URL，但不触发滚动
            history.pushState(null, '', link.href);
        });
        
        toc.appendChild(link);
        tocLinks.push({
            link: link,
            heading: heading
        });
    });

    // 添加滚动监听
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                highlightCurrentSection(tocLinks);
                ticking = false;
            });
            ticking = true;
        }
    });

    // 初始检查 URL 中的锚点
    if (window.location.hash) {
        const targetHeading = document.querySelector(window.location.hash);
        if (targetHeading) {
            setTimeout(() => {
                targetHeading.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    }
}

// 修改高亮当前部分的函数
function highlightCurrentSection(tocLinks) {
    const scrollPos = window.scrollY + 100;

    // 移除所有活动类
    tocLinks.forEach(({link}) => link.classList.remove('active'));

    // 找到当前可见的标题
    for (let i = tocLinks.length - 1; i >= 0; i--) {
        const {link, heading} = tocLinks[i];
        if (heading.offsetTop <= scrollPos) {
            link.classList.add('active');
            // 更新 URL，但不触发滚动
            history.replaceState(null, '', `#${heading.id}`);
            break;
        }
    }
}
